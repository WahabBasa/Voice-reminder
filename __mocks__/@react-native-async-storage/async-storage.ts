const store = new Map<string, string>();

const AsyncStorage = {
  getItem: jest.fn(async (key: string) => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    store.delete(key);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  _store: store,
  _reset: () => {
    store.clear();
    AsyncStorage.getItem.mockClear();
    AsyncStorage.setItem.mockClear();
    AsyncStorage.removeItem.mockClear();
    AsyncStorage.clear.mockClear();
  },
};

export default AsyncStorage;
