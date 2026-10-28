import bootstrap from '../bootstrap'
import { mockLogger } from '../__mocks__/strapi'

/**
 * Build a Strapi mock exposing only what the bootstrap needs.
 *
 * @param {object} options
 * @param {Function} options.fetchIndexUids - Implementation of meilisearch.fetchIndexUids.
 * @param {string[]} options.indexedContentTypes - Content types stored as indexed.
 */
function createBootstrapStrapi({ fetchIndexUids, indexedContentTypes }) {
  const store = {
    syncCredentials: jest.fn(),
    getIndexedContentTypes: jest.fn(async () => indexedContentTypes),
    removeIndexedContentType: jest.fn(),
    emptyListenedContentTypes: jest.fn(),
  }
  const lifecycle = { subscribeContentType: jest.fn() }
  const meilisearch = {
    fetchIndexUids: jest.fn(fetchIndexUids),
    // Same contract as the real service: swallow errors and return []. Lets the
    // tests run against code that still calls `getIndexUids`.
    getIndexUids: jest.fn(async () => {
      try {
        return await fetchIndexUids()
      } catch {
        return []
      }
    }),
    getIndexNamesOfContentType: jest.fn(({ contentType }) => [
      contentType.split('.').pop(),
    ]),
  }
  const contentType = {
    getContentTypesUid: jest.fn(() => indexedContentTypes),
  }
  const services = { store, lifecycle, meilisearch, contentType }

  return {
    strapi: {
      log: mockLogger,
      plugin: jest.fn(() => ({ service: name => services[name] })),
      admin: {
        services: {
          permission: { actionProvider: { registerMany: jest.fn() } },
        },
      },
    },
    store,
    lifecycle,
  }
}

describe('Bootstrap: indexed collections and Meilisearch availability', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('keeps indexed collections and their listeners when Meilisearch is unreachable', async () => {
    const { strapi, store, lifecycle } = createBootstrapStrapi({
      fetchIndexUids: async () => {
        throw new Error('Request to http://localhost:7700/stats has failed')
      },
      indexedContentTypes: ['api::restaurant.restaurant'],
    })
    // @ts-ignore
    global.strapi = strapi

    await bootstrap({ strapi })

    expect(store.removeIndexedContentType).not.toHaveBeenCalled()
    expect(lifecycle.subscribeContentType).toHaveBeenCalledWith({
      contentType: 'api::restaurant.restaurant',
    })
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('keeping indexed collections'),
    )
  })

  test('still removes a collection whose index is really missing in Meilisearch', async () => {
    const { strapi, store } = createBootstrapStrapi({
      fetchIndexUids: async () => ['about'],
      indexedContentTypes: ['api::restaurant.restaurant'],
    })
    // @ts-ignore
    global.strapi = strapi

    await bootstrap({ strapi })

    expect(store.removeIndexedContentType).toHaveBeenCalledWith({
      contentType: 'api::restaurant.restaurant',
    })
  })

  test('keeps a collection whose index exists in Meilisearch', async () => {
    const { strapi, store, lifecycle } = createBootstrapStrapi({
      fetchIndexUids: async () => ['restaurant'],
      indexedContentTypes: ['api::restaurant.restaurant'],
    })
    // @ts-ignore
    global.strapi = strapi

    await bootstrap({ strapi })

    expect(store.removeIndexedContentType).not.toHaveBeenCalled()
    expect(lifecycle.subscribeContentType).toHaveBeenCalledWith({
      contentType: 'api::restaurant.restaurant',
    })
  })
})
