import createMeilisearchService from '../services/meilisearch'
import { MeiliSearch as Meilisearch } from 'meilisearch'
import { mockLogger } from '../__mocks__/strapi'

jest.mock('meilisearch')

/**
 * Build a Strapi mock with one indexed and listened content type.
 */
function createReportStrapi() {
  const store = {
    getCredentials: jest.fn(() => ({
      host: 'http://localhost:7700',
      apiKey: 'masterKey',
    })),
    getListenedContentTypes: jest.fn(async () => [
      'api::restaurant.restaurant',
    ]),
    getIndexedContentTypes: jest.fn(async () => ['api::restaurant.restaurant']),
    removeIndexedContentType: jest.fn(),
  }
  const contentType = {
    getContentTypesUid: jest.fn(() => ['api::restaurant.restaurant']),
    getCollectionName: jest.fn(() => 'restaurant'),
    totalNumberOfEntries: jest.fn(async () => 2),
  }
  const services = { store, contentType, lifecycle: {} }
  const strapi = {
    log: mockLogger,
    config: { get: jest.fn(() => ({})) },
    plugin: jest.fn(() => ({ service: name => services[name] })),
  }
  return { strapi, store }
}

describe('Content types report and Meilisearch availability', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not unselect an indexed collection when Meilisearch is unreachable', async () => {
    const { strapi, store } = createReportStrapi()
    // @ts-ignore
    global.strapi = strapi
    // @ts-ignore
    Meilisearch.mockImplementation(() => ({
      getStats: jest.fn(async () => {
        throw new Error('Request to http://localhost:7700/stats has failed')
      }),
    }))

    const meilisearchService = createMeilisearchService({ strapi })
    const reports = await meilisearchService.getContentTypesReport()

    expect(store.removeIndexedContentType).not.toHaveBeenCalled()
    expect(reports.contentTypes[0]).toMatchObject({
      contentType: 'api::restaurant.restaurant',
      indexUid: 'restaurant',
      indexed: false,
      listened: true,
      numberOfEntries: 2,
    })
  })

  test('still unselects a collection whose index is really missing in Meilisearch', async () => {
    const { strapi, store } = createReportStrapi()
    // @ts-ignore
    global.strapi = strapi
    // @ts-ignore
    Meilisearch.mockImplementation(() => ({
      getStats: jest.fn(async () => ({ indexes: { about: {} } })),
    }))

    const meilisearchService = createMeilisearchService({ strapi })
    await meilisearchService.getContentTypesReport()

    expect(store.removeIndexedContentType).toHaveBeenCalledWith({
      contentType: 'api::restaurant.restaurant',
    })
  })
})
