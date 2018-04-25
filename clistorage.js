var DB_SCHEMA = {
};


var dbPromise;	// global promise ensuring DB is available before any transactions take place

function initPersistor(){
	
	// dependency checks and fallbacks
	function takeDependencies(){
		return requisite.take("indexedDB") && requisite.take("promise");		// No i18N
	}
	var dependency_success = takeDependencies();
	if(!dependency_success) { return; }	// module level failure
		
	Object.freeze(DB_SCHEMA);
	var self = {};
	
	(function(self) {	// promise based Async wrapper for indexedDB
	  'use strict';			// No i18N
	  function toArray(arr) {
	    return Array.prototype.slice.call(arr);
	  }

	  function promisifyRequest(request) {
	    return new Promise(function(resolve, reject) {
	      request.onsuccess = function() {
	        resolve(request.result);
	      };

	      request.onerror = function() {
	        reject(request.error);
	      };
	    });
	  }

	  function promisifyRequestCall(obj, method, args) {
	    var request;
	    var p = new Promise(function(resolve, reject) {
	      request = obj[method].apply(obj, args);
	      promisifyRequest(request).then(resolve, reject);
	    });

	    p.request = request;
	    return p;
	  }

	  function promisifyCursorRequestCall(obj, method, args) {
	    var p = promisifyRequestCall(obj, method, args);
	    return p.then(function(value) {
	      if (!value) {
	    	  return;
	      }
	      return new Cursor(value, p.request);
	    });
	  }

	  function proxyProperties(ProxyClass, targetProp, properties) {
	    properties.forEach(function(prop) {
	      Object.defineProperty(ProxyClass.prototype, prop, {
	        get: function() {
	          return this[targetProp][prop];
	        },
	        set: function(val) {
	          this[targetProp][prop] = val;
	        }
	      });
	    });
	  }

	  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
	    properties.forEach(function(prop) {
	      if (!(prop in Constructor.prototype)) {
	    	  return;
	      }
	      ProxyClass.prototype[prop] = function() {
	        return promisifyRequestCall(this[targetProp], prop, arguments);
	      };
	    });
	  }

	  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
	    properties.forEach(function(prop) {
	      if (!(prop in Constructor.prototype)) {
	    	  return;
	      }
	      ProxyClass.prototype[prop] = function() {
	        return this[targetProp][prop].apply(this[targetProp], arguments);
	      };
	    });
	  }

	  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
	    properties.forEach(function(prop) {
	      if (!(prop in Constructor.prototype)) {
	    	  return;
	      }
	      ProxyClass.prototype[prop] = function() {
	        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
	      };
	    });
	  }

	  function Index(index) {
	    this._index = index;
	  }

	  proxyProperties(Index, '_index', [			// No i18N
	    'name',					// No i18N
	    'keyPath',				// No i18N
	    'multiEntry',			// No i18N
	    'unique'				// No i18N
	  ]);

	  proxyRequestMethods(Index, '_index', IDBIndex, [			// No i18N
	    'get',					// No i18N
	    'getKey',				// No i18N
	    'getAll',				// No i18N
	    'getAllKeys',			// No i18N
	    'count'					// No i18N
	  ]);

	  proxyCursorRequestMethods(Index, '_index', IDBIndex, [			// No i18N
	    'openCursor',			// No i18N
	    'openKeyCursor'			// No i18N
	  ]);

	  function Cursor(cursor, request) {
	    this._cursor = cursor;
	    this._request = request;
	  }

	  proxyProperties(Cursor, '_cursor', [			// No i18N
	    'direction',			// No i18N
	    'key',					// No i18N
	    'primaryKey',			// No i18N
	    'value'					// No i18N
	  ]);

	  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [			// No i18N
	    'update',			// No i18N
	    'delete'			// No i18N
	  ]);

	  // proxy 'next' methods
	  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {			// No i18N
	    if (!(methodName in IDBCursor.prototype)) {
	    	return;
	    }
	    Cursor.prototype[methodName] = function() {
	      var cursor = this;
	      var args = arguments;
	      return Promise.resolve().then(function() {
	        cursor._cursor[methodName].apply(cursor._cursor, args);
	        return promisifyRequest(cursor._request).then(function(value) {
	          if (!value) {
	        	  return;
	          }
	          return new Cursor(value, cursor._request);
	        });
	      });
	    };
	  });

	  function ObjectStore(store) {
	    this._store = store;
	  }

	  ObjectStore.prototype.createIndex = function() {
	    return new Index(this._store.createIndex.apply(this._store, arguments));
	  };

	  ObjectStore.prototype.index = function() {
	    return new Index(this._store.index.apply(this._store, arguments));
	  };

	  proxyProperties(ObjectStore, '_store', [			// No i18N
	    'name',					// No i18N
	    'keyPath',				// No i18N
	    'indexNames',			// No i18N
	    'autoIncrement'			// No i18N
	  ]);

	  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [			// No i18N
	    'put',				// No i18N
	    'add',				// No i18N
	    'delete',			// No i18N
	    'clear',			// No i18N
	    'get',				// No i18N
	    'getAll',			// No i18N
	    'getKey',			// No i18N
	    'getAllKeys',		// No i18N
	    'count'				// No i18N
	  ]);

	  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [			// No i18N
	    'openCursor',			// No i18N
	    'openKeyCursor'			// No i18N
	  ]);

	  proxyMethods(ObjectStore, '_store', IDBObjectStore, [			// No i18N
	    'deleteIndex'			// No i18N
	  ]);

	  function Transaction(idbTransaction) {
	    this._tx = idbTransaction;
	    this.complete = new Promise(function(resolve, reject) {
	      idbTransaction.oncomplete = function() {
	        resolve();
	      };
	      idbTransaction.onerror = function() {
	        reject(idbTransaction.error);
	      };
	      idbTransaction.onabort = function() {
	        reject(idbTransaction.error);
	      };
	    });
	  }

	  Transaction.prototype.objectStore = function() {
	    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
	  };

	  proxyProperties(Transaction, '_tx', [			// No i18N
	    'objectStoreNames',			// No i18N
	    'mode'						// No i18N
	  ]);

	  proxyMethods(Transaction, '_tx', IDBTransaction, [			// No i18N
	    'abort'			// No i18N
	  ]);

	  function UpgradeDB(db, oldVersion, transaction) {
	    this._db = db;
	    this.oldVersion = oldVersion;
	    this.transaction = new Transaction(transaction);
	  }

	  UpgradeDB.prototype.createObjectStore = function() {
	    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
	  };

	  proxyProperties(UpgradeDB, '_db', [			// No i18N
	    'name',						// No i18N
	    'version',					// No i18N
	    'objectStoreNames'			// No i18N
	  ]);

	  proxyMethods(UpgradeDB, '_db', IDBDatabase, [			// No i18N
	    'deleteObjectStore',			// No i18N
	    'close'							// No i18N
	  ]);

	  function DB(db) {
	    this._db = db;
	  }

	  DB.prototype.transaction = function() {
	    return new Transaction(this._db.transaction.apply(this._db, arguments));
	  };

	  proxyProperties(DB, '_db', [			// No i18N
	    'name',						// No i18N
	    'version',					// No i18N
	    'objectStoreNames'			// No i18N
	  ]);

	  proxyMethods(DB, '_db', IDBDatabase, [			// No i18N
	    'close'			// No i18N
	  ]);

	  // Add cursor iterators
	  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {			// No i18N
	    [ObjectStore, Index].forEach(function(Constructor) {
	      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {			// No i18N
	        var args = toArray(arguments);
	        var callback = args[args.length - 1];
	        var nativeObject = this._store || this._index;
	        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
	        request.onsuccess = function() {
	          callback(request.result);
	        };
	      };
	    });
	  });

	  // polyfill getAll
	  [Index, ObjectStore].forEach(function(Constructor) {
	    if (Constructor.prototype.getAll) {
	    	return;
	    }
	    Constructor.prototype.getAll = function(query, count) {
	      var instance = this;
	      var items = [];

	      return new Promise(function(resolve) {
	        instance.iterateCursor(query, function(cursor) {
	          if (!cursor) {
	            resolve(items);
	            return;
	          }
	          items.push(cursor.value);

	          if (count !== undefined && items.length == count) {
	            resolve(items);
	            return;
	          }
	          cursor["continue"]();			// No i18N
	        });
	      });
	    };
	  });

	  var exp = {
	    open: function(name, version, upgradeCallback) {
	      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);			// No i18N
	      var request = p.request;

	      request.onupgradeneeded = function(event) {
	        if (upgradeCallback) {
	          upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
	        }
	      };

	      return p.then(function(db) {
	        return new DB(db);
	      });
	    },
	    del: function(name) {
	      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);			// No i18N
	    }
	  };

	  if(self){
		  self.idb = exp;	// the global idb object
	  }

	}(self));
	
	// ###### keyshelf ##### simple key retrieval of value to be used by any user of the FWPlatform (window level access)
	(function(self) {	// a global key (str) --> value (tree-like obj) store
	  'use strict';			// No i18N
	  var db;
	  function getDB() {
	    if (!db) {
	      db = new Promise(function(resolve, reject) {
	        var openreq = indexedDB.open('keyval-store', 1);			// No i18N

	        openreq.onerror = function() {
	          reject(openreq.error);
	        };

	        openreq.onupgradeneeded = function() {
	          // First time setup: create an empty object store
	          openreq.result.createObjectStore('keyval');			// No i18N
	        };

	        openreq.onsuccess = function() {
	          resolve(openreq.result);
	        };
	      });
	    }
	    return db;
	  }

	  function withStore(type, callback) {
	    return getDB().then(function(db) {
	      return new Promise(function(resolve, reject) {
	        var transaction = db.transaction('keyval', type);			// No i18N
	        transaction.oncomplete = function() {
	          resolve();
	        };
	        transaction.onerror = function() {
	          reject(transaction.error);
	        };
	        callback(transaction.objectStore('keyval'));			// No i18N
	      });
	    });
	  }

	  var idbKeyval = {
	    get: function(key) {
	      var req;
	      return withStore('readonly', function(store) {			// No i18N
	        req = store.get(key);
	      }).then(function() {
	        return req.result;
	      });
	    },
	    set: function(key, value) {
	      return withStore('readwrite', function(store) {			// No i18N
	        store.put(value, key);
	      });
	    },
	    del: function(key) {
	      return withStore('readwrite', function(store) {			// No i18N
	        (store["delete"])(key);			// No i18N
	      });
	    },
	    clear: function() {
	      return withStore('readwrite', function(store) {			// No i18N
	        store.clear();
	      });
	    },
	    keys: function() {
	      var keys = [];
	      return withStore('readonly', function(store) {			// No i18N
	        // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
	        // And openKeyCursor isn't supported by Safari.
	        (store.openKeyCursor || store.openCursor).call(store).onsuccess = function() {
	          if (!this.result) {
	        	  return;
	          }
	          keys.push(this.result.key);
	          (this.result["continue"])();			// No i18N
	        };
	      }).then(function() {
	        return keys;
	      });
	    }
	  };

	  self.keyshelf = idbKeyval;	// the global keyshelf object registered with the window
	}(window)); // interface : keyshelf.[get, set, del, clear, keys]()
	
	
	// ############################# DB promise and object-stores creation below ########################################
	
	
	
	function init(){
		if(dependency_success){
			try{
				dbPromise = self.idb.open('sdp-clientDB', 1, function(upgradeDb) {			// No i18N
					dependency_success = dependency_success && createObjectStores(upgradeDb);
				});
			} catch(err){
				dependency_success = false;
				return;
			}
			if(dependency_success){
				initSuccess();
			}
		}
	}
	
	function initSuccess(){
		requisite.grant("cliDB");			// No i18N
	}
	
	function createObjectStores(upgradeDb){
		try{
			for(os_name in DB_SCHEMA){
				if(!upgradeDb.objectStoreNames.contains(os_name)){
					var os = upgradeDb.createObjectStore(os_name, DB_SCHEMA[os_name]);
					var indexes = DB_SCHEMA[os_name].indexes;
					for(indname in indexes){
						os.createIndex(indname, indexes[indname].propname, indexes[indname].options);
					}
				}
			}
			return true;
		} catch(e){
			return false;
		}
	}
	init();
}


// initiate DB
initPersistor();



