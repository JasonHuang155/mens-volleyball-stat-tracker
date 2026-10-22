// Runs before every test file. Tests run in Node, not a browser, so there's
// no real IndexedDB: this installs a pretend one that keeps data in memory.
import 'fake-indexeddb/auto'
