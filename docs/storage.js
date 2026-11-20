import { emptyState } from './model.js';

// GitHub Pages projects under the same username can share an origin.
const databaseName = 'journal-epilepsie:' + new URL('./', import.meta.url).pathname;
const storeName = 'journal';
const stateKey = 'state';
let connection;

function openDatabase() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Fermez les autres fenêtres du journal et réessayez.'));
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function transaction(mode, update) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = store.get(stateKey);
    let state;
    let failure;
    request.onsuccess = () => {
      state = request.result ?? emptyState();
      if (update) {
        try {
          update(state);
          store.put(state, stateKey);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      }
    };
    tx.oncomplete = () => resolve(state);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Écriture interrompue.'));
  });
}

export const loadJournal = () => transaction('readonly');
export const updateJournal = update => transaction('readwrite', update);
