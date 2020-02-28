(function () {
  'use strict';

  /*
  * SystemJS 6.0.0
  */
  (function () {
    const hasSelf = typeof self !== 'undefined';

    const hasDocument = typeof document !== 'undefined';

    const envGlobal = hasSelf ? self : global;

    let baseUrl;

    if (hasDocument) {
      const baseEl = document.querySelector('base[href]');
      if (baseEl)
        baseUrl = baseEl.href;
    }

    if (!baseUrl && typeof location !== 'undefined') {
      baseUrl = location.href.split('#')[0].split('?')[0];
      const lastSepIndex = baseUrl.lastIndexOf('/');
      if (lastSepIndex !== -1)
        baseUrl = baseUrl.slice(0, lastSepIndex + 1);
    }

    const backslashRegEx = /\\/g;
    function resolveIfNotPlainOrUrl (relUrl, parentUrl) {
      if (relUrl.indexOf('\\') !== -1)
        relUrl = relUrl.replace(backslashRegEx, '/');
      // protocol-relative
      if (relUrl[0] === '/' && relUrl[1] === '/') {
        return parentUrl.slice(0, parentUrl.indexOf(':') + 1) + relUrl;
      }
      // relative-url
      else if (relUrl[0] === '.' && (relUrl[1] === '/' || relUrl[1] === '.' && (relUrl[2] === '/' || relUrl.length === 2 && (relUrl += '/')) ||
          relUrl.length === 1  && (relUrl += '/')) ||
          relUrl[0] === '/') {
        const parentProtocol = parentUrl.slice(0, parentUrl.indexOf(':') + 1);
        // Disabled, but these cases will give inconsistent results for deep backtracking
        //if (parentUrl[parentProtocol.length] !== '/')
        //  throw Error('Cannot resolve');
        // read pathname from parent URL
        // pathname taken to be part after leading "/"
        let pathname;
        if (parentUrl[parentProtocol.length + 1] === '/') {
          // resolving to a :// so we need to read out the auth and host
          if (parentProtocol !== 'file:') {
            pathname = parentUrl.slice(parentProtocol.length + 2);
            pathname = pathname.slice(pathname.indexOf('/') + 1);
          }
          else {
            pathname = parentUrl.slice(8);
          }
        }
        else {
          // resolving to :/ so pathname is the /... part
          pathname = parentUrl.slice(parentProtocol.length + (parentUrl[parentProtocol.length] === '/'));
        }

        if (relUrl[0] === '/')
          return parentUrl.slice(0, parentUrl.length - pathname.length - 1) + relUrl;

        // join together and split for removal of .. and . segments
        // looping the string instead of anything fancy for perf reasons
        // '../../../../../z' resolved to 'x/y' is just 'z'
        const segmented = pathname.slice(0, pathname.lastIndexOf('/') + 1) + relUrl;

        const output = [];
        let segmentIndex = -1;
        for (let i = 0; i < segmented.length; i++) {
          // busy reading a segment - only terminate on '/'
          if (segmentIndex !== -1) {
            if (segmented[i] === '/') {
              output.push(segmented.slice(segmentIndex, i + 1));
              segmentIndex = -1;
            }
          }

          // new segment - check if it is relative
          else if (segmented[i] === '.') {
            // ../ segment
            if (segmented[i + 1] === '.' && (segmented[i + 2] === '/' || i + 2 === segmented.length)) {
              output.pop();
              i += 2;
            }
            // ./ segment
            else if (segmented[i + 1] === '/' || i + 1 === segmented.length) {
              i += 1;
            }
            else {
              // the start of a new segment as below
              segmentIndex = i;
            }
          }
          // it is the start of a new segment
          else {
            segmentIndex = i;
          }
        }
        // finish reading out the last segment
        if (segmentIndex !== -1)
          output.push(segmented.slice(segmentIndex));
        return parentUrl.slice(0, parentUrl.length - pathname.length) + output.join('');
      }
    }

    /*
     * Import maps implementation
     *
     * To make lookups fast we pre-resolve the entire import map
     * and then match based on backtracked hash lookups
     *
     */

    function resolveUrl (relUrl, parentUrl) {
      return resolveIfNotPlainOrUrl(relUrl, parentUrl) || (relUrl.indexOf(':') !== -1 ? relUrl : resolveIfNotPlainOrUrl('./' + relUrl, parentUrl));
    }

    function objectAssign (to, from) {
      for (let p in from)
        to[p] = from[p];
      return to;
    }

    function resolveAndComposePackages (packages, outPackages, baseUrl, parentMap, parentUrl) {
      for (let p in packages) {
        const rhs = packages[p];
        // package fallbacks not currently supported
        if (typeof rhs !== 'string')
          continue;
        const mapped = resolveImportMap(parentMap, resolveIfNotPlainOrUrl(rhs, baseUrl) || rhs, parentUrl);
        if (!mapped)
          targetWarning(p, rhs, 'bare specifier did not resolve');
        else
          outPackages[p] = mapped;
      }
    }

    function resolveAndComposeImportMap (json, baseUrl, parentMap) {
      const outMap = { imports: objectAssign({}, parentMap.imports), scopes: objectAssign({}, parentMap.scopes) };

      if (json.imports)
        resolveAndComposePackages(json.imports, outMap.imports, baseUrl, parentMap, null);

      if (json.scopes)
        for (let s in json.scopes) {
          const resolvedScope = resolveUrl(s, baseUrl);
          resolveAndComposePackages(json.scopes[s], outMap.scopes[resolvedScope] || (outMap.scopes[resolvedScope] = {}), baseUrl, parentMap, resolvedScope);
        }

      return outMap;
    }

    function getMatch (path, matchObj) {
      if (matchObj[path])
        return path;
      let sepIndex = path.length;
      do {
        const segment = path.slice(0, sepIndex + 1);
        if (segment in matchObj)
          return segment;
      } while ((sepIndex = path.lastIndexOf('/', sepIndex - 1)) !== -1)
    }

    function applyPackages (id, packages) {
      const pkgName = getMatch(id, packages);
      if (pkgName) {
        const pkg = packages[pkgName];
        if (pkg === null) return;
        if (id.length > pkgName.length && pkg[pkg.length - 1] !== '/')
          targetWarning(pkgName, pkg, "should have a trailing '/'");
        else
          return pkg + id.slice(pkgName.length);
      }
    }

    function targetWarning (match, target, msg) {
      console.warn("Package target " + msg + ", resolving target '" + target + "' for " + match);
    }

    function resolveImportMap (importMap, resolvedOrPlain, parentUrl) {
      let scopeUrl = parentUrl && getMatch(parentUrl, importMap.scopes);
      while (scopeUrl) {
        const packageResolution = applyPackages(resolvedOrPlain, importMap.scopes[scopeUrl]);
        if (packageResolution)
          return packageResolution;
        scopeUrl = getMatch(scopeUrl.slice(0, scopeUrl.lastIndexOf('/')), importMap.scopes);
      }
      return applyPackages(resolvedOrPlain, importMap.imports) || resolvedOrPlain.indexOf(':') !== -1 && resolvedOrPlain;
    }

    /*
     * SystemJS Core
     *
     * Provides
     * - System.import
     * - System.register support for
     *     live bindings, function hoisting through circular references,
     *     reexports, dynamic import, import.meta.url, top-level await
     * - System.getRegister to get the registration
     * - Symbol.toStringTag support in Module objects
     * - Hookable System.createContext to customize import.meta
     * - System.onload(err, id, deps) handler for tracing / hot-reloading
     *
     * Core comes with no System.prototype.resolve or
     * System.prototype.instantiate implementations
     */

    const hasSymbol = typeof Symbol !== 'undefined';
    const toStringTag = hasSymbol && Symbol.toStringTag;
    const REGISTRY = hasSymbol ? Symbol() : '@';

    function SystemJS () {
      this[REGISTRY] = {};
    }

    const systemJSPrototype = SystemJS.prototype;

    systemJSPrototype.prepareImport = function () {};

    systemJSPrototype.import = function (id, parentUrl) {
      const loader = this;
      return Promise.resolve(loader.prepareImport())
      .then(function() {
        return loader.resolve(id, parentUrl);
      })
      .then(function (id) {
        const load = getOrCreateLoad(loader, id);
        return load.C || topLevelLoad(loader, load);
      });
    };

    // Hookable createContext function -> allowing eg custom import meta
    systemJSPrototype.createContext = function (parentId) {
      return {
        url: parentId
      };
    };

    // onLoad(err, id, deps) provided for tracing / hot-reloading
    systemJSPrototype.onload = function () {};
    function loadToId (load) {
      return load.id;
    }
    function triggerOnload (loader, load, err) {
      loader.onload(err, load.id, load.d && load.d.map(loadToId));
      if (err)
        throw err;
    }

    let lastRegister;
    systemJSPrototype.register = function (deps, declare) {
      lastRegister = [deps, declare];
    };

    /*
     * getRegister provides the last anonymous System.register call
     */
    systemJSPrototype.getRegister = function () {
      const _lastRegister = lastRegister;
      lastRegister = undefined;
      return _lastRegister;
    };

    function getOrCreateLoad (loader, id, firstParentUrl) {
      let load = loader[REGISTRY][id];
      if (load)
        return load;

      const importerSetters = [];
      const ns = Object.create(null);
      if (toStringTag)
        Object.defineProperty(ns, toStringTag, { value: 'Module' });

      let instantiatePromise = Promise.resolve()
      .then(function () {
        return loader.instantiate(id, firstParentUrl);
      })
      .then(function (registration) {
        if (!registration)
          throw Error('Module ' + id + ' did not instantiate');
        function _export (name, value) {
          // note if we have hoisted exports (including reexports)
          load.h = true;
          let changed = false;
          if (typeof name !== 'object') {
            if (!(name in ns) || ns[name] !== value) {
              ns[name] = value;
              changed = true;
            }
          }
          else {
            for (let p in name) {
              let value = name[p];
              if (!(p in ns) || ns[p] !== value) {
                ns[p] = value;
                changed = true;
              }
            }
          }
          if (changed)
            for (let i = 0; i < importerSetters.length; i++)
              importerSetters[i](ns);
          return value;
        }
        const declared = registration[1](_export, registration[1].length === 2 ? {
          import: function (importId) {
            return loader.import(importId, id);
          },
          meta: loader.createContext(id)
        } : undefined);
        load.e = declared.execute || function () {};
        return [registration[0], declared.setters || []];
      });

      instantiatePromise = instantiatePromise.catch(function (err) {
          triggerOnload(loader, load, err);
        });

      const linkPromise = instantiatePromise
      .then(function (instantiation) {
        return Promise.all(instantiation[0].map(function (dep, i) {
          const setter = instantiation[1][i];
          return Promise.resolve(loader.resolve(dep, id))
          .then(function (depId) {
            const depLoad = getOrCreateLoad(loader, depId, id);
            // depLoad.I may be undefined for already-evaluated
            return Promise.resolve(depLoad.I)
            .then(function () {
              if (setter) {
                depLoad.i.push(setter);
                // only run early setters when there are hoisted exports of that module
                // the timing works here as pending hoisted export calls will trigger through importerSetters
                if (depLoad.h || !depLoad.I)
                  setter(depLoad.n);
              }
              return depLoad;
            });
          })
        }))
        .then(function (depLoads) {
          load.d = depLoads;
        });
      });

      linkPromise.catch(function (err) {
        load.e = null;
        load.er = err;
      });

      // Capital letter = a promise function
      return load = loader[REGISTRY][id] = {
        id: id,
        // importerSetters, the setters functions registered to this dependency
        // we retain this to add more later
        i: importerSetters,
        // module namespace object
        n: ns,

        // instantiate
        I: instantiatePromise,
        // link
        L: linkPromise,
        // whether it has hoisted exports
        h: false,

        // On instantiate completion we have populated:
        // dependency load records
        d: undefined,
        // execution function
        // set to NULL immediately after execution (or on any failure) to indicate execution has happened
        // in such a case, C should be used, and E, I, L will be emptied
        e: undefined,

        // On execution we have populated:
        // the execution error if any
        er: undefined,
        // in the case of TLA, the execution promise
        E: undefined,

        // On execution, L, I, E cleared

        // Promise for top-level completion
        C: undefined
      };
    }

    function instantiateAll (loader, load, loaded) {
      if (!loaded[load.id]) {
        loaded[load.id] = true;
        // load.L may be undefined for already-instantiated
        return Promise.resolve(load.L)
        .then(function () {
          return Promise.all(load.d.map(function (dep) {
            return instantiateAll(loader, dep, loaded);
          }));
        })
      }
    }

    function topLevelLoad (loader, load) {
      return load.C = instantiateAll(loader, load, {})
      .then(function () {
        return postOrderExec(loader, load, {});
      })
      .then(function () {
        return load.n;
      });
    }

    // the closest we can get to call(undefined)
    const nullContext = Object.freeze(Object.create(null));

    // returns a promise if and only if a top-level await subgraph
    // throws on sync errors
    function postOrderExec (loader, load, seen) {
      if (seen[load.id])
        return;
      seen[load.id] = true;

      if (!load.e) {
        if (load.er)
          throw load.er;
        if (load.E)
          return load.E;
        return;
      }

      // deps execute first, unless circular
      let depLoadPromises;
      load.d.forEach(function (depLoad) {
        {
          try {
            const depLoadPromise = postOrderExec(loader, depLoad, seen);
            if (depLoadPromise) {
              depLoadPromise.catch(function (err) {
                triggerOnload(loader, load, err);
              });
              (depLoadPromises = depLoadPromises || []).push(depLoadPromise);
            }
          }
          catch (err) {
            triggerOnload(loader, load, err);
          }
        }
      });
      if (depLoadPromises)
        return Promise.all(depLoadPromises).then(doExec);

      return doExec();

      function doExec () {
        try {
          let execPromise = load.e.call(nullContext);
          if (execPromise) {
            execPromise = execPromise.then(function () {
                load.C = load.n;
                load.E = null; // indicates completion
                triggerOnload(loader, load, null);
              }, function (err) {
                triggerOnload(loader, load, err);
              });
            return load.E = load.E || execPromise;
          }
          // (should be a promise, but a minify optimization to leave out Promise.resolve)
          load.C = load.n;
          triggerOnload(loader, load, null);
        }
        catch (err) {
          triggerOnload(loader, load, err);
          load.er = err;
          throw err;
        }
        finally {
          load.L = load.I = undefined;
          load.e = null;
        }
      }
    }

    envGlobal.System = new SystemJS();

    /*
     * Supports loading System.register via script tag injection
     */

    const systemRegister = systemJSPrototype.register;
    systemJSPrototype.register = function (deps, declare) {
      systemRegister.call(this, deps, declare);
    };

    systemJSPrototype.instantiate = function (url, firstParentUrl) {
      const loader = this;
      return new Promise(function (resolve, reject) {
        let err;

        function windowErrorListener(evt) {
          if (evt.filename === url)
            err = evt.error;
        }

        window.addEventListener('error', windowErrorListener);

        const script = document.createElement('script');
        script.charset = 'utf-8';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.addEventListener('error', function () {
          window.removeEventListener('error', windowErrorListener);
          reject(Error('Error loading ' + url + (firstParentUrl ? ' from ' + firstParentUrl : '')));
        });
        script.addEventListener('load', function () {
          window.removeEventListener('error', windowErrorListener);
          document.head.removeChild(script);
          // Note that if an error occurs that isn't caught by this if statement,
          // that getRegister will return null and a "did not instantiate" error will be thrown.
          if (err) {
            reject(err);
          }
          else {
            resolve(loader.getRegister());
          }
        });
        script.src = url;
        document.head.appendChild(script);
      });
    };

    if (hasDocument) {
      window.addEventListener('DOMContentLoaded', loadScriptModules);
      loadScriptModules();
    }

    function loadScriptModules() {
      document.querySelectorAll('script[type=systemjs-module]').forEach(function (script) {
        if (script.src) {
          System.import(script.src.slice(0, 7) === 'import:' ? script.src.slice(7) : resolveUrl(script.src, baseUrl));
        }
      });
    }

    /*
     * Supports loading System.register in workers
     */

    if (hasSelf && typeof importScripts === 'function')
      systemJSPrototype.instantiate = function (url) {
        const loader = this;
        return new Promise(function (resolve, reject) {
          try {
            importScripts(url);
          }
          catch (e) {
            reject(e);
          }
          resolve(loader.getRegister());
        });
      };

    /*
     * SystemJS global script loading support
     * Extra for the s.js build only
     * (Included by default in system.js build)
     */
    (function (global) {

    const systemJSPrototype = System.constructor.prototype;

    // safari unpredictably lists some new globals first or second in object order
    let firstGlobalProp, secondGlobalProp, lastGlobalProp;
    function getGlobalProp () {
      let cnt = 0;
      let lastProp;
      for (let p in global) {
        // do not check frames cause it could be removed during import
        if (!global.hasOwnProperty(p) || (!isNaN(p) && p < global.length))
          continue;
        if (cnt === 0 && p !== firstGlobalProp || cnt === 1 && p !== secondGlobalProp)
          return p;
        cnt++;
        lastProp = p;
      }
      if (lastProp !== lastGlobalProp)
        return lastProp;
    }

    function noteGlobalProps () {
      // alternatively Object.keys(global).pop()
      // but this may be faster (pending benchmarks)
      firstGlobalProp = secondGlobalProp = undefined;
      for (let p in global) {
        // do not check frames cause it could be removed during import
        if (!global.hasOwnProperty(p) || (!isNaN(p) && p < global.length))
          continue;
        if (!firstGlobalProp)
          firstGlobalProp = p;
        else if (!secondGlobalProp)
          secondGlobalProp = p;
        lastGlobalProp = p;
      }
      return lastGlobalProp;
    }

    const impt = systemJSPrototype.import;
    systemJSPrototype.import = function () {
      noteGlobalProps();
      return impt.apply(this, arguments);
    };

    const emptyInstantiation = [[], function () { return {} }];

    const getRegister = systemJSPrototype.getRegister;
    systemJSPrototype.getRegister = function () {
      const lastRegister = getRegister.call(this);
      if (lastRegister)
        return lastRegister;

      // no registration -> attempt a global detection as difference from snapshot
      // when multiple globals, we take the global value to be the last defined new global object property
      // for performance, this will not support multi-version / global collisions as previous SystemJS versions did
      // note in Edge, deleting and re-adding a global does not change its ordering
      const globalProp = getGlobalProp();
      if (!globalProp)
        return emptyInstantiation;

      let globalExport;
      try {
        globalExport = global[globalProp];
      }
      catch (e) {
        return emptyInstantiation;
      }

      return [[], function (_export) {
        return {
          execute: function () {
            _export({ default: globalExport, __useDefault: true });
          }
        };
      }];
    };

    })(typeof self !== 'undefined' ? self : global);

    /*
     * Loads JSON, CSS, Wasm module types based on file extensions
     * Supports application/javascript falling back to JS eval
     */
    const instantiate = systemJSPrototype.instantiate;
    systemJSPrototype.instantiate = function (url, parent) {
      const loader = this;
      const ext = url.slice(url.lastIndexOf('.'));
      switch (ext) {
        case '.css':
          return loadDynamicModule(function (_export, source) {
            // Relies on a Constructable Stylesheet polyfill
            const stylesheet = new CSSStyleSheet();
            stylesheet.replaceSync(source);
            _export('default', stylesheet);
          });
        case '.html':
          return getSourceRes().then(function (res) {
            return maybeJSFallback(res) || loadError("'.html' modules not implemented");
          });
        case '.json':
          return loadDynamicModule(function (_export, source) {
            _export('default', JSON.parse(source));
          });
        case '.wasm':
          return getSourceRes().then(function (res) {
            return maybeJSFallback(res) ||
                (WebAssembly.compileStreaming ? WebAssembly.compileStreaming(res) : res.arrayBuffer().then(WebAssembly.compile));
          })
          .then(function (module) {
            const deps = [];
            const setters = [];
            const importObj = {};
        
            // we can only set imports if supported (eg early Safari doesnt support)
            if (WebAssembly.Module.imports)
              WebAssembly.Module.imports(module).forEach(function (impt) {
                const key = impt.module;
                if (deps.indexOf(key) === -1) {
                  deps.push(key);
                  setters.push(function (m) {
                    importObj[key] = m;
                  });
                }
              });
        
            return [deps, function (_export) {
              return {
                setters: setters,
                execute: function () {
                  return WebAssembly.instantiate(module, importObj)
                  .then(function (instance) {
                    _export(instance.exports);
                  });
                }
              };
            }];
          });
      }
      return instantiate.apply(this, arguments);

      function getSourceRes () {
        return fetch(url).then(function (res) {
          if (!res.ok)
            loadError(res.status + ' ' + res.statusText);
          return res;
        });
      }
      function maybeJSFallback (res) {
        const contentType = res.headers.get('content-type');
        // if the resource is sent as application/javascript, support eval-based execution
        if (contentType && contentType.match(/^application\/javascript(;|$)/)) {
          return res.text().then(function (source) {
            (0, eval)(source);
            return loader.getRegister();
          });
        }
      }
      function loadDynamicModule (createExec) {
        return getSourceRes().then(function (res) {
          return maybeJSFallback(res) || res.text().then(function (source) {
            return [[], function (_export) {
              return { execute: createExec(_export, source) };
            }];
          });
        });
      }
      function loadError (msg) {
        throw Error(msg + ', loading ' + url + (parent ? ' from ' + parent : ''));
      }
    };

    /*
     * Import map support for SystemJS
     * 
     * <script type="systemjs-importmap">{}</script>
     * OR
     * <script type="systemjs-importmap" src=package.json></script>
     * 
     * Only those import maps available at the time of SystemJS initialization will be loaded
     * and they will be loaded in DOM order.
     * 
     * There is no support for dynamic import maps injection currently.
     */

    let importMap = { imports: {}, scopes: {} }, importMapPromise;

    if (hasDocument) {
      Array.prototype.forEach.call(document.querySelectorAll('script[type="systemjs-importmap"][src]'), function (script) {
        script._j = fetch(script.src).then(function (res) {
          return res.json();
        });
      });
    }

    systemJSPrototype.prepareImport = function () {
      if (!importMapPromise) {
        importMapPromise = Promise.resolve();
        if (hasDocument)
          Array.prototype.forEach.call(document.querySelectorAll('script[type="systemjs-importmap"]'), function (script) {
            importMapPromise = importMapPromise.then(function () {
              return (script._j || script.src && fetch(script.src).then(function (resp) { return resp.json(); }) || Promise.resolve(JSON.parse(script.innerHTML)))
              .then(function (json) {
                importMap = resolveAndComposeImportMap(json, script.src || baseUrl, importMap);
              });
            });
          });
      }
      return importMapPromise;
    };

    systemJSPrototype.resolve = function (id, parentUrl) {
      parentUrl = parentUrl || baseUrl;
      return resolveImportMap(importMap, resolveIfNotPlainOrUrl(id, parentUrl) || id, parentUrl) || throwUnresolved(id, parentUrl);
    };

    function throwUnresolved (id, parentUrl) {
      throw Error("Unable to resolve specifier '" + id + (parentUrl ? "' from " + parentUrl : "'"));
    }

    const toStringTag$1 = typeof Symbol !== 'undefined' && Symbol.toStringTag;

    systemJSPrototype.get = function (id) {
      const load = this[REGISTRY][id];
      if (load && load.e === null && !load.E) {
        if (load.er)
          return null;
        return load.n;
      }
    };

    systemJSPrototype.getLoad = function (id) {
      return this[REGISTRY][id];
    };

    systemJSPrototype.set = function (id, module) {
      let ns;
      if (toStringTag$1 && module[toStringTag$1] === 'Module') {
        ns = module;
      }
      else {
        ns = Object.assign(Object.create(null), module);
        if (toStringTag$1)
          Object.defineProperty(ns, toStringTag$1, { value: 'Module' });
      }

      const done = Promise.resolve(ns);

      const load = this[REGISTRY][id] || (this[REGISTRY][id] = {
        id: id,
        i: [],
        h: false,
        d: [],
        e: null,
        er: undefined,
        E: undefined
      });

      if (load.e || load.E)
        return false;

      Object.assign(load, {
        n: ns,
        I: done,
        L: done,
        C: done
      });
      return ns;
    };

    systemJSPrototype.has = function (id) {
      const load = this[REGISTRY][id];
      return !!load;
    };

    // Delete function provided for hot-reloading use cases
    systemJSPrototype.delete = function (id) {
      const registry = this[REGISTRY];
      const load = registry[id];
      // in future we can support load.E case by failing load first
      // but that will require TLA callbacks to be implemented
      if (!load || load.e !== null || load.E)
        return false;

      let importerSetters = load.i;
      // remove from importerSetters
      // (release for gc)
      if (load.d)
        load.d.forEach(function (depLoad) {
          const importerIndex = depLoad.i.indexOf(load);
          if (importerIndex !== -1)
            depLoad.i.splice(importerIndex, 1);
        });
      delete registry[id];
      return function () {
        const load = registry[id];
        if (!load || !importerSetters || load.e !== null || load.E)
          return false;

        // add back the old setters
        importerSetters.forEach(setter => {
          load.i.push(setter);
          setter(load.n);
        });
        importerSetters = null;
      };
    };

    const iterator = typeof Symbol !== 'undefined' && Symbol.iterator;

    systemJSPrototype.entries = function () {
      const loader = this, keys = Object.keys(loader[REGISTRY]);
      let index = 0, ns, key;
      const result = {
        next: function () {
          while (
            (key = keys[index++]) !== undefined &&
            (ns = loader.get(key)) === undefined
          );
          return {
            done: key === undefined,
            value: key !== undefined && [key, ns]
          };
        }
      };

      result[iterator] = function() { return this };

      return result;
    };

    (function () {
      const systemJSPrototype = System.constructor.prototype;
      const lastUpdateFunction = {};

      systemJSPrototype.reload = function (id, parentUrl) {
        const loader = this;

        // System.import resolves the url before setting up the loading state
        // doing the same here ensures we don't run into race conditions
        return Promise.resolve()
          .then(function () {
            return loader.resolve(id, parentUrl);
          })
          .then(function (id) {
            if (!loader.has(id)) {
              // module was not loaded before
              return loader.import(id);
            }

            // import the module to ensure that the current module is full loaded
            return loader.import(id)
              .catch(function () {
                // don't handle errors from the previous import, they might be fixed in the reload
              })
              .then(function () {
                // delete the module from the registry, re-import it and
                // update the references in the registry
                const update = loader.delete(id);

                function onResolved() {
                  if (update) {
                    update();
                  } else if (id in lastUpdateFunction) {
                    lastUpdateFunction[id]();
                  }

                  lastUpdateFunction[id] = update;
                }
                return loader.import(id)
                  .catch(function (error) {
                    onResolved();
                    throw error;
                  })
                  .then(function (module) {
                    onResolved();
                    return module;
                  });
              });
          });
      };

    })();

  }());

  const gid = '__ROLLUP_PLUGIN_HOT_RUNTIME';

  var constants = { gid };
  var constants_1 = constants.gid;

  const depsMap = {};
  const importersMap = {};
  const errors = {};

  const getImporterEntry = id => {
    const existing = importersMap[id];
    if (!existing) {
      return (importersMap[id] = [])
    }
    return existing
  };

  // TODO building this reverse lookup map is probably overkill
  const setDeps = (err, id, deps) => {
    if (err) {
      errors[id] = err;
    } else {
      delete errors[id];
    }
    if (deps) {
      depsMap[id] = deps;
      deps.forEach(dep => {
        const entry = getImporterEntry(dep);
        entry.push(id);
      });
    }
  };

  const forgetDeps = id => {
    const deps = depsMap[id];
    if (deps) {
      delete depsMap[id];
      for (const dep of deps) {
        const importerDeps = importersMap[dep];
        if (!importerDeps) continue
        const index = importerDeps.indexOf(id);
        if (index < 0) continue
        importerDeps.splice(index, 1);
      }
    }
  };

  const getImporters = id => importersMap[id];

  const getError = id => errors[id];

  const serial = handler => {
    let promise;
    return () => (promise = promise ? promise.then(handler) : handler())
  };

  let queue = [];
  let queueMap = {};

  const hotStates = {};

  class HotState {
    // data: undefined
    // acceptCallback: null
    // disposeCallback: null

    constructor(id) {
      this.id = id;
    }

    accept(cb = true) {
      this.acceptCallback = cb;
    }

    dispose(cb) {
      this.disposeCallback = cb;
    }
  }

  const getHotState = id => {
    const existing = hotStates[id];
    if (existing) {
      return existing
    }
    const state = new HotState(id);
    hotStates[id] = state;
    return state
  };

  const createHotContext = id => getHotState(id);

  const invalidate = (id, reload = false, rerun = true) => {
    const item = queueMap[id];
    if (item) {
      queue.splice(item.index, 1);
      item.index = queue.length;
      if (reload) {
        item.reload = true;
      } else if (rerun) {
        item.rerun = true;
      }
      queue.push(item);
    } else {
      const item = { index: queue.length, id, reload, rerun };
      queueMap[id] = item;
      queue.push(item);
    }
  };

  const scheduleRerun = id => invalidate(id, false, true);

  const scheduleReload = id => invalidate(id, true);

  const flush = serial(async function doFlush() {
    const currentQueue = queue;

    queue = [];
    queueMap = {};

    const moduleErrors = [];
    const acceptErrors = [];

    // do all reload/rerun after dispose phase
    const reloadQueue = [];

    // for (const { id, reload, rerun } of currentQueue) {
    for (const { id, reload: realReload, rerun } of currentQueue) {
      // TODO rerun is implemented as reload for now, short of a better solution
      const reload = realReload || rerun;
      const state = getHotState(id);
      const acceptCb = state.acceptCallback;
      const disposeCb = state.disposeCallback;
      if (reload || rerun) {
        delete state.acceptCallback;
        delete state.disposeCallback;
        if (reload) {
          forgetDeps(id);
        }
        // aligned with Webpack:
        // - module.hot.data is undefined on initial module load
        // - module.hot.data defaults to {} after a HMR update, even if the
        //   module has no dispose handlers
        state.data = {};
      }
      if (typeof disposeCb === 'function') {
        await disposeCb(state.data);
      }
      if (reload) {
        reloadQueue.push(async () => {
          try {
            await System.reload(id);
            const error = getError(id);
            if (error) {
              moduleErrors.push({ id, error });
            } else {
              if (typeof acceptCb === 'function') {
                try {
                  await acceptCb();
                } catch (error) {
                  acceptErrors.push({ id, error });
                }
              }
            }
          } catch (error) {
            moduleErrors.push({ id, error });
          }
        });
      } else if (rerun) {
        throw new Error('TODO')
      } else {
        System.delete(id);
      }
    }

    for (const reload of reloadQueue) {
      await reload();
    }

    const total = moduleErrors.length + acceptErrors.length;
    const errors =
      total === 0
        ? null
        : {
            module: moduleErrors.length > 0 ? moduleErrors : null,
            accept: acceptErrors.length > 0 ? acceptErrors : null,
          };

    return { errors }
  });

  const applyUpdate = (id, forceReload = false) => {
    const parentIds = getImporters(id);

    if (forceReload) {
      scheduleReload(id);
    } else {
      invalidate(id);
    }

    const accepted = getHotState(id).acceptCallback;
    if (accepted) {
      scheduleRerun(id);
      return true
    }

    if (!parentIds) {
      return false
    }

    let every = true;
    for (const pid of parentIds) {
      // TODO these modules don't need a reload, just refreshing their
      //      bindings + execute again
      const accepted = applyUpdate(pid);
      if (!accepted) {
        every = false;
      }
    }

    return every
  };

  var installSystemHooks = () => {
    const proto = System.constructor.prototype;

    const createContext = proto.createContext;
    proto.createContext = function(...args) {
      const [url] = args;
      return {
        ...createContext.apply(this, args),
        hot: createHotContext(url),
      }
    };

    const onload = proto.onload;
    proto.onload = function(...args) {
      const [err, id, deps] = args;
      setDeps(err, id, deps);
      return onload.apply(this, args)
    };
  };

  const removeElement = el => el && el.parentNode && el.parentNode.removeChild(el);

  const ErrorOverlay = () => {
    let errors = [];
    let compileError = null;

    const errorsTitle = 'Failed to init module';
    const compileErrorTitle = 'Failed to compile';

    const style = {
      section: `
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 32px;
      background: rgba(0, 0, 0, .85);
      font-family: Menlo, Consolas, monospace;
      font-size: large;
      color: rgb(232, 232, 232);
      overflow: auto;
      z-index: 2147483647;
    `,
      h1: `
      margin-top: 0;
      color: #E36049;
      font-size: large;
      font-weight: normal;
    `,
      h2: `
      margin: 32px 0 0;
      font-size: large;
      font-weight: normal;
    `,
      pre: ``,
    };

    const createOverlay = () => {
      const h1 = document.createElement('h1');
      h1.style = style.h1;
      const section = document.createElement('section');
      section.appendChild(h1);
      section.style = style.section;
      const body = document.createElement('div');
      section.appendChild(body);
      return { h1, el: section, body }
    };

    const setTitle = title => {
      overlay.h1.textContent = title;
    };

    const show = () => {
      const { el } = overlay;
      if (!el.parentNode) {
        const target = document.body;
        target.appendChild(overlay.el);
      }
    };

    const hide = () => {
      const { el } = overlay;
      if (el.parentNode) {
        overlay.el.remove();
      }
    };

    const update = () => {
      if (compileError) {
        overlay.body.innerHTML = '';
        setTitle(compileErrorTitle);
        const errorEl = renderError(compileError);
        overlay.body.appendChild(errorEl);
        show();
      } else if (errors.length > 0) {
        overlay.body.innerHTML = '';
        setTitle(errorsTitle);
        errors.forEach(({ title, message }) => {
          const errorEl = renderError(message, title);
          overlay.body.appendChild(errorEl);
        });
        show();
      } else {
        hide();
      }
    };

    const renderError = (message, title) => {
      const div = document.createElement('div');
      if (title) {
        const h2 = document.createElement('h2');
        h2.textContent = title;
        h2.style = style.h2;
        div.appendChild(h2);
      }
      const pre = document.createElement('pre');
      pre.textContent = message;
      div.appendChild(pre);
      return div
    };

    const addError = (error, title) => {
      const message = (error && error.stack) || error;
      errors.push({ title, message });
      update();
    };

    const clearErrors = () => {
      errors.forEach(({ element }) => {
        removeElement(element);
      });
      errors = [];
      update();
    };

    const setCompileError = message => {
      compileError = message;
      update();
    };

    const overlay = createOverlay();

    return {
      addError,
      clearErrors,
      setCompileError,
    }
  };

  /* eslint-disable no-console */
  const logPrefix = '[HMR]';

  const verbose = console.debug.bind(console, logPrefix);

  const log = console.log.bind(console, logPrefix);

  const warn = console.warn.bind(console, logPrefix);

  const error = console.error.bind(console, logPrefix);

  const clear = console.clear.bind(console);

  var createWebSocketClient = ({
    ws: useWebSocket,
    host,
    port = 38670,
    reload: reloadOption = true,
  }) => {

    const reloadOn = reloadOption
      ? {
          acceptError: true,
          moduleError: 'defer',
          error: true,
          ...reloadOption,
        }
      : false;

    let deferredFullReload = false;

    const wsUrl = `${host.replace('%hostname%', location.hostname) ||
    location.hostname}:${port}`;

    let clearConsole = false;
    let rootUrl;

    const overlay = ErrorOverlay();

    const unresolve = id => {
      const baseUrl = rootUrl || location.origin + '/';
      const pre = String(id).slice(0, baseUrl.length);
      if (pre === baseUrl) {
        return String(id).slice(baseUrl.length)
      } else {
        return id
      }
    };

    const doReload = () => window.location.reload();

    const doFullReload = (flag, msg) => {
      if (flag === 'defer') {
        deferredFullReload = true;
        const action = 'full reload on next update';
        log(`${msg}: ${action}`);
        return false
      } else if (flag) {
        if (deferredFullReload) {
          // deferred reload takes precedence because the rationale is that there
          // is still something broken in user's code and reloading now would just
          // throw the same error again (nominal case of deferred reload is when
          // a module body cannot be executed)
          const action = 'full reload already scheduled on next update';
          log(`${msg}: ${action}`);
          return false
        } else {
          const action = 'full reload';
          // yes, the log message is only visible with something like "preserve log"
          log(`${msg}: ${action}`);
          doReload();
          return true
        }
      } else {
        const action = 'full reload required';
        log(`${msg}: ${action}`);
        return false
      }
    };
    const reloadModule = msg => doFullReload(reloadOn.moduleError, msg);
    const reloadAccept = msg => doFullReload(reloadOn.acceptError, msg);
    const reloadError = msg => doFullReload(reloadOn.error, msg);

    const applyOptions = opts => {
      clearConsole = opts.clearConsole;

      // The entrypoints will use the address of the user's HTTP server (e.g.
      // localhost), because they're always written to disk where the user expects
      // them to be, and so they're served by the user controlled server.
      //
      // @hot files will either be served by the same server, OR the WS server
      // in-memory file server (e.g. 127.0.0.1)
      //
      // Host name for the user's HTTP server is determined from the URL the user
      // has typed in their address bar (e.g. localhost).
      //
      // Host name of the WS server can be known precisely since, contrary to the
      // user's server, we control it. The host name is determined automatically
      // with `getAddress` and is most likely the IP (e.g. 127.0.0.1, even if the
      // user will more probably type 'localhost').
      //
      // Theoretically, the entrypoint files can never change during a normal HMR
      // session. They're just wrappers to inject HMR runtime and point to the
      // actual module under in the @hot files.
      //
      // Module ids in updates are relative to the domain root.
      //
      // In conclusion: we need to resolve module ids from the WS server base URL
      // if and only if files are served from memory (i.e. WS server).
      //
      if (opts.inMemory) {
        rootUrl = `${location.protocol}//${wsUrl}/`;
      }

      if (opts.reload === false) {
        Object.keys(reloadOn).forEach(key => {
          reloadOn[key] = false;
        });
      } else {
        Object.assign(reloadOn, opts.reload);
      }
    };

    const applyAccepted = async accepted => {
      if (!accepted) {
        {
          verbose(
            'Update has not been accepted: hot reloading all the things'
          );
        }
      }

      const { errors } = await flush();

      overlay.setCompileError(null);
      overlay.clearErrors();

      if (clearConsole) {
        clear();
      }

      if (errors) {
        // error(s) on sync run of module body
        if (errors.module) {
          for (const { id, error: error$1 } of errors.module) {
            error(`Error during reloaded module init: ${id}\n`, error$1);
          }
          const reload = reloadModule('Error during reloaded module init');
          // !reload: no overlay if reload has been triggered
          // deferredFullReload: overlay would be tro disruptive if reload=false
          if (!reload && deferredFullReload) {
            for (const { id, error } of errors.module) {
              overlay.addError(error, unresolve(id));
            }
          }
        }
        // error(s) in accept callbacks
        if (errors.accept) {
          for (const { id, error: error$1 } of errors.accept) {
            error(`Failed to accept update to module ${id}\n`, error$1);
          }
          const reload = reloadAccept('Failed to accept update');
          // !error.module: don't mix with module errors; module errors are
          // displayed first because the accept error is probably a consequence
          // of the module error
          if (!reload && deferredFullReload && !errors.module) {
            for (const { id, error } of errors.accept) {
              overlay.addError(error, unresolve(id));
            }
          }
        }
      }

      if (!errors) {
        log('Up to date');
      }
    };

    const acceptChanges = changes => {
      const allAccepted = changes
        .map(name => System.resolve(name, rootUrl))
        .filter(id => {
          if (!System.has(id)) {
            // no warning: it can happen with dynamic import() that rollup bundles
            // files that the browser doesn't load
            //   log.warn(`Detected change to unknown module: ${id}`)
            return false
          }
          return System.has(id)
        })
        .map(id => {
          try {
            return applyUpdate(id, true)
          } catch (err) {
            overlay.addError(err);
            throw err
          }
        });

      return allAccepted.length > 0 && allAccepted.every(Boolean)
    };

    const handleApplyAcceptError = err => {
      error((err && err.stack) || err);
      const reload = reloadError('Failed to apply update');
      if (!reload) {
        overlay.addError(err);
      }
    };

    const processChanges = changes => {
      // TODO handle removed?

      if (deferredFullReload) {
        log('Reloading...');
        doReload();
        return
      }

      if (changes.length === 0) {
        log('Nothing changed');
        return
      }

      verbose('Apply changes...');

      const accepted = acceptChanges(changes);

      return applyAccepted(accepted).catch(handleApplyAcceptError)
    };

    const onMessage = e => {
      const hot = JSON.parse(e.data);

      if (hot.greeting) {
        applyOptions(hot.greeting);
        // log last: "Enabled" means we're up and running
        log('Enabled');
      }

      if (hot.status) {
        switch (hot.status) {
          case 'prepare':
            log('Rebuilding...');
            break
        }
      }

      if (hot.changes) {
        processChanges(hot.changes);
      }

      if (hot.errors) {
        const { build } = hot.errors;
        if (build) {
          log('Build error!');
          overlay.setCompileError(build.formatted || build);
        }
      }
    };

    if (useWebSocket) {
      const ws = new WebSocket(`ws://${wsUrl}`);
      ws.onmessage = onMessage;
    } else {
      const source = new EventSource(`//${wsUrl}/~hot`);
      source.onmessage = onMessage;
    }
  };

  const resolveAddress = () => {
    const g =
      (typeof window !== 'undefined' && window) ||
      // eslint-disable-next-line no-undef
      (typeof global !== 'undefined' && global);
    const { host, port, ws } = g[constants_1];
    return { host, port, ws }
  };

  const { host, port, ws } = resolveAddress();

  installSystemHooks();

  createWebSocketClient({ host, port, ws });

}());
//# sourceMappingURL=hmr-runtime.js.map
