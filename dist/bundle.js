'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var _objectSpread = _interopDefault(require('@babel/runtime/helpers/objectSpread'));
var _toConsumableArray = _interopDefault(require('@babel/runtime/helpers/toConsumableArray'));
var _slicedToArray = _interopDefault(require('@babel/runtime/helpers/slicedToArray'));
var _classCallCheck = _interopDefault(require('@babel/runtime/helpers/classCallCheck'));
var _createClass = _interopDefault(require('@babel/runtime/helpers/createClass'));
var _regeneratorRuntime = _interopDefault(require('@babel/runtime/regenerator'));
var _asyncToGenerator = _interopDefault(require('@babel/runtime/helpers/asyncToGenerator'));
var fs = _interopDefault(require('fs-extra'));
var path = require('path');
var util = require('util');
var _ = _interopDefault(require('lodash'));
var glob = _interopDefault(require('glob-promise'));

var DEFAULT_WRAPPERS = {
  python: 'lambda_wrapper',
  node: 'lambdaWrapper',
  tsnode: 'lambdaWrapper'
};

var WRAPPER_CODE = function WRAPPER_CODE(_ref) {
  var relativePath = _ref.relativePath,
      method = _ref.method,
      wrapper = _ref.wrapper,
      token = _ref.token,
      appName = _ref.appName,
      collectorUrl = _ref.collectorUrl,
      metadataOnly = _ref.metadataOnly,
      urlsToIgnore = _ref.urlsToIgnore,
      payloadsToIgnore = _ref.payloadsToIgnore,
      ignoredKeys = _ref.ignoredKeys,
      labels = _ref.labels;
  var commonNode = `
  if (!process.env.EPSAGON_IGNORED_KEYS) {
    process.env.EPSAGON_IGNORED_KEYS = "${ignoredKeys || ''}";
  }

  if (!process.env.EPSAGON_URLS_TO_IGNORE) {
    process.env.EPSAGON_URLS_TO_IGNORE = "${urlsToIgnore || ''}";
  }
  
  if (!process.env.EPSAGON_PAYLOADS_TO_IGNORE) {
    process.env.EPSAGON_PAYLOADS_TO_IGNORE = '${payloadsToIgnore}';
  }

epsagon.init({
    token: '${token}',
    appName: '${appName}',
    traceCollectorURL: ${collectorUrl},
    metadataOnly: Boolean(${metadataOnly}),
    labels: ${labels || '[]'},
});`;
  return {
    python: `
from ${relativePath} import ${method} as ${method}_internal
${method} = ${method}_internal
try:
    import epsagon
    import os
        
    ${urlsToIgnore ? `os.environ['EPSAGON_URLS_TO_IGNORE'] = '${urlsToIgnore}' if 'EPSAGON_URLS_TO_IGNORE' not in os.environ else os.environ['EPSAGON_URLS_TO_IGNORE']` : ''}
    ${ignoredKeys ? `os.environ['EPSAGON_IGNORED_KEYS'] = '${ignoredKeys}' if 'EPSAGON_IGNORED_KEYS' not in os.environ else os.environ['EPSAGON_IGNORED_KEYS']` : ''}
    ${payloadsToIgnore ? `os.environ['EPSAGON_PAYLOADS_TO_IGNORE'] = '${payloadsToIgnore}' if 'EPSAGON_PAYLOADS_TO_IGNORE' not in os.environ else os.environ['EPSAGON_PAYLOADS_TO_IGNORE']` : ''}
    
    null = None  # used to ignore arguments
    undefined = None  # used to ignore arguments
    epsagon.init(
        token='${token}',
        app_name='${appName}',
        collector_url=${collectorUrl},
        metadata_only=bool(${metadataOnly})
    )

    ${method} = epsagon.${wrapper}(${method}_internal)
except:
    print('Warning: Epsagon package not found. The function will not be monitored')
`,
    node: `
const epsagon = require('epsagon');
const epsagonHandler = require('../${relativePath}.js');

${commonNode}

exports.${method} = epsagon.${wrapper}(epsagonHandler.${method});
`,
    tsnode: `
import * as epsagon from 'epsagon';
import * as epsagonHandler from '../${relativePath}';

${commonNode}

export const ${method} = epsagon.${wrapper}(epsagonHandler.${method});
`
  };
};

var FILE_NAME_BY_LANG_GENERATORS = {
  python: function python(name) {
    return `${name}.py`;
  },
  node: function node(name) {
    return `${name}.js`;
  },
  tsnode: function tsnode(name) {
    return `${name}.ts`;
  }
};
var SUPPORTED_LANGUAGES = ['python', 'node'];
/**
 * generates an epsagon wrapper for a function.
 * @param {Object} func The function to wrap.
 * @param {Object} epsagonConf The Epsagon's config object.
 * @return {String} The wrapper code.
 */

function generateWrapperCode(func, epsagonConf) {
  var collectorURL = epsagonConf.collectorURL,
      token = epsagonConf.token,
      appName = epsagonConf.appName,
      metadataOnly = epsagonConf.metadataOnly,
      urlsToIgnore = epsagonConf.urlsToIgnore,
      payloadsToIgnore = epsagonConf.payloadsToIgnore,
      ignoredKeys = epsagonConf.ignoredKeys,
      labels = epsagonConf.labels;

  var _ref2 = func.epsagon || {},
      _ref2$wrapper = _ref2.wrapper,
      wrapper = _ref2$wrapper === void 0 ? DEFAULT_WRAPPERS[func.language] : _ref2$wrapper;

  var relativePath = func.language === 'python' ? func.relativePath.replace(/\//g, '.').replace(/\\/g, '.') : func.relativePath;
  var labelsFormatted = typeof labels === 'object' ? JSON.stringify(labels) : labels;
  var ignoredKeysFormatted = typeof payloadsToIgnore === 'object' ? JSON.stringify(payloadsToIgnore) : '';
  return WRAPPER_CODE({
    relativePath,
    method: func.method,
    wrapper,
    token,
    appName,
    collectorUrl: collectorURL ? `'${collectorURL}'` : undefined,
    metadataOnly: metadataOnly === true ? '1' : '0',
    urlsToIgnore,
    payloadsToIgnore: ignoredKeysFormatted,
    ignoredKeys,
    labels: labelsFormatted
  })[func.language];
}
/**
 * Generates a full name for a wrapper.
 * @param {Object} func The function to wrap.
 * @return {String} The generated name.
 */

function generateWrapperExt(func) {
  return FILE_NAME_BY_LANG_GENERATORS[func.language](func.epsagonHandler);
}

var mkdir = fs.mkdirpSync;
var writeFile = util.promisify(fs.writeFile);
var VALIDATE_LIB_BY_LANG = {
  /**
   * Validates the python Epsagon's library
   */
  python() {
    this.log('Python functions found, please make sure to install the Epsagon Python library.');
  },

  /**
   * Validates the node Epsagon's library
   */
  node() {
    var _this = this;

    return _asyncToGenerator(
    /*#__PURE__*/
    _regeneratorRuntime.mark(function _callee() {
      var pack, _pack, _pack$dependencies, dependencies;

      return _regeneratorRuntime.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              _context.prev = 0;
              _context.next = 3;
              return fs.readJson(_this.config().packageJsonPath || path.join(_this.prefix, 'package.json'));

            case 3:
              pack = _context.sent;
              _context.next = 10;
              break;

            case 6:
              _context.prev = 6;
              _context.t0 = _context["catch"](0);

              _this.log('Could not read package.json. Skipping Epsagon library validation - please make sure you have it installed!');

              return _context.abrupt("return");

            case 10:
              _pack = pack, _pack$dependencies = _pack.dependencies, dependencies = _pack$dependencies === void 0 ? [] : _pack$dependencies;

              if (Object.keys(dependencies).some(function (dep) {
                return dep === 'epsagon';
              })) {
                _context.next = 13;
                break;
              }

              throw new Error('Epsagon\'s Node library must be installed in order to use this plugin!');

            case 13:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, null, [[0, 6]]);
    }))();
  }

};
VALIDATE_LIB_BY_LANG.tsnode = VALIDATE_LIB_BY_LANG.node;
/**
 * Epsagon's serverless plugin.
 */

var ServerlessEpsagonPlugin =
/*#__PURE__*/
function () {
  /**
   * The constructor for the plugin.
   * @param {Object} sls The serverless framework object.
   * @param {Object} opts options.
   */
  function ServerlessEpsagonPlugin() {
    var sls = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var opts = arguments.length > 1 ? arguments[1] : undefined;

    _classCallCheck(this, ServerlessEpsagonPlugin);

    this.sls = sls;
    this.prefix = opts.prefix || this.sls.config.servicePath || process.env.npm_config_prefix;
    this.funcs = [];
    this.originalServicePath = this.sls.config.servicePath;
    this.commands = {
      epsagon: {
        usage: 'Automatically wraps your function handlers with Epsagon.',
        lifecycleEvents: ['run', 'clean'],
        commands: {
          clean: {
            usage: 'Cleans up extra Epsagon files if necessary',
            lifecycleEvents: ['init']
          },
          run: {
            usage: 'Generates epsagon\'s handlers',
            lifecycleEvents: ['init']
          }
        }
      }
    }; // Added: Schema based validation of service config
    // https://github.com/serverless/serverless/releases/tag/v1.78.0

    if (this.sls.configSchemaHandler) {
      var newCustomPropSchema = {
        type: 'object',
        properties: {
          epsagon: {
            type: 'object',
            properties: {
              token: {
                type: 'string'
              },
              appName: {
                type: 'string'
              },
              disable: {
                type: 'boolean'
              },
              metadataOnly: {
                type: 'boolean'
              },
              handlersDirName: {
                type: 'string'
              },
              packageJsonPath: {
                type: 'string'
              },
              collectorURL: {
                type: 'string'
              },
              ignoredKeys: {
                type: 'string'
              },
              urlsToIgnore: {
                type: 'string'
              },
              payloadsToIgnore: {
                type: 'array'
              },
              labels: {
                type: 'string'
              },
              wrapper: {
                type: 'string'
              }
            },
            additionalProperties: false
          }
        }
      };
      this.sls.configSchemaHandler.defineCustomProperties(newCustomPropSchema); // Added: defineFunctionProperties schema extension method
      // https://github.com/serverless/serverless/releases/tag/v2.10.0

      if (this.sls.configSchemaHandler.defineFunctionProperties) {
        this.sls.configSchemaHandler.defineFunctionProperties('aws', {
          properties: {
            epsagon: {
              type: 'object',
              properties: {
                appName: {
                  type: 'string'
                },
                disable: {
                  type: 'boolean'
                },
                wrapper: {
                  type: 'string'
                }
              },
              additionalProperties: false
            }
          }
        });
      }
    }

    this.hooks = {
      'after:package:initialize': this.run.bind(this),
      'before:deploy:function:packageFunction': this.run.bind(this),
      'before:invoke:local:invoke': this.run.bind(this),
      'before:offline:start:init': this.run.bind(this),
      'before:step-functions-offline:start': this.run.bind(this),
      'after:package:createDeploymentArtifacts': this.cleanup.bind(this),
      'after:invoke:local:invoke': this.cleanup.bind(this),
      'epsagon:clean:init': this.cleanup.bind(this),
      'epsagon:run:init': this.run.bind(this),
      'after:deploy:deploy': this.link.bind(this)
    };
  }
  /**
   * logs a message to the sls console.
   * @param {string} format The format of the message.
   * @param {Array} args Additional arguments.
   */


  _createClass(ServerlessEpsagonPlugin, [{
    key: "log",
    value: function log(format) {
      var _this$sls$cli;

      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      (_this$sls$cli = this.sls.cli).log.apply(_this$sls$cli, [`[serverless-plugin-epsagon] ${format}`].concat(args));
    }
    /**
     * prints a link to the Epsagon functions page.
     */

  }, {
    key: "link",
    value: function () {
      var _link = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee2() {
        return _regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                this.log('Monitor and troubleshoot your functions at \u001B[4mhttps://app.epsagon.com/functions\u001B[24m');

              case 1:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function link() {
        return _link.apply(this, arguments);
      }

      return link;
    }()
    /**
     * Wraps function handlers with Epsagon
     */

  }, {
    key: "run",
    value: function () {
      var _run = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee3() {
        return _regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                if (!(this.config().disable && this.config().disable.toString().toLowerCase() === 'true')) {
                  _context3.next = 3;
                  break;
                }

                this.log('Epsagon disabled - not wrapping functions');
                return _context3.abrupt("return");

              case 3:
                if (this.config().token) {
                  _context3.next = 6;
                  break;
                }

                this.log('No epsagon token was supplied - not wrapping functions');
                return _context3.abrupt("return");

              case 6:
                this.log('Wrapping your functions with Epsagon...');
                fs.removeSync(path.join(this.originalServicePath, this.config().handlersDirName));
                this.funcs = this.findFuncs();
                _context3.next = 11;
                return this.handleTS();

              case 11:
                _context3.next = 13;
                return this.validateLib();

              case 13:
                _context3.next = 15;
                return this.generateHandlers();

              case 15:
                this.assignHandlers();

              case 16:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function run() {
        return _run.apply(this, arguments);
      }

      return run;
    }()
    /**
     * Checks that all of the required epsagon libraries are installed.
     */

  }, {
    key: "validateLib",
    value: function () {
      var _validateLib = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee5() {
        var _this2 = this;

        var languages;
        return _regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                languages = _.uniq(this.funcs.map(function (func) {
                  return func.language;
                }));
                _context5.next = 3;
                return Promise.all(languages.map(
                /*#__PURE__*/
                function () {
                  var _ref = _asyncToGenerator(
                  /*#__PURE__*/
                  _regeneratorRuntime.mark(function _callee4(lang) {
                    return _regeneratorRuntime.wrap(function _callee4$(_context4) {
                      while (1) {
                        switch (_context4.prev = _context4.next) {
                          case 0:
                            _context4.next = 2;
                            return VALIDATE_LIB_BY_LANG[lang].bind(_this2)();

                          case 2:
                          case "end":
                            return _context4.stop();
                        }
                      }
                    }, _callee4);
                  }));

                  return function (_x) {
                    return _ref.apply(this, arguments);
                  };
                }()));

              case 3:
              case "end":
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function validateLib() {
        return _validateLib.apply(this, arguments);
      }

      return validateLib;
    }()
    /**
     * Changes all the typescript functions correctly
     */

  }, {
    key: "handleTS",
    value: function () {
      var _handleTS = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee7() {
        return _regeneratorRuntime.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                _context7.next = 2;
                return Promise.all(this.funcs.map(
                /*#__PURE__*/
                function () {
                  var _ref2 = _asyncToGenerator(
                  /*#__PURE__*/
                  _regeneratorRuntime.mark(function _callee6(func) {
                    var handler, relativePath, matchingFiles;
                    return _regeneratorRuntime.wrap(function _callee6$(_context6) {
                      while (1) {
                        switch (_context6.prev = _context6.next) {
                          case 0:
                            handler = _.isString(func.handler) ? func.handler.split('.') : [];
                            relativePath = handler.slice(0, -1).join('.');
                            matchingFiles = glob.sync(`${relativePath}.*`);

                            if (matchingFiles.length > 0 && (matchingFiles[0].endsWith('.ts') || matchingFiles[0].endsWith('.tsx'))) {
                              // This is a good enough test for now. lets treat it as TS.
                              func.language = 'tsnode'; // eslint-disable-line no-param-reassign
                            }

                          case 4:
                          case "end":
                            return _context6.stop();
                        }
                      }
                    }, _callee6);
                  }));

                  return function (_x2) {
                    return _ref2.apply(this, arguments);
                  };
                }()));

              case 2:
              case "end":
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function handleTS() {
        return _handleTS.apply(this, arguments);
      }

      return handleTS;
    }()
    /**
     * Finds all the functions the plugin should wrap with Epsagon.
     * @return {Array} The functions to wrap.
     */

  }, {
    key: "findFuncs",
    value: function findFuncs() {
      var _this3 = this;

      return Object.entries(this.sls.service.functions).reduce(function (result, pair) {
        var _pair = _slicedToArray(pair, 2),
            key = _pair[0],
            func = _pair[1];

        var runtime = func.runtime || _this3.sls.service.provider.runtime;

        var _ref3 = func.epsagon || {},
            disable = _ref3.disable;

        var handler = _.isString(func.handler) ? func.handler.split('.') : [];
        var relativePath = handler.slice(0, -1).join('.');

        if (disable) {
          _this3.log(`Epsagon is disabled for function ${key}, skipping.`);

          return result;
        }

        if (!_.isString(runtime)) {
          return result;
        }

        var language = SUPPORTED_LANGUAGES.find(function (lang) {
          return runtime.toLowerCase().match(lang);
        });

        if (!language) {
          _this3.log(`Runtime "${runtime}" is not supported yet, skipping function ${key}`);

          return result;
        }

        result.push(Object.assign(func, {
          method: _.last(handler),
          key,
          relativePath,
          language,
          epsagonHandler: `${key}-epsagon`
        }));
        return result;
      }, []);
    }
    /**
     * Generates the Epsagon handlers and writes them to the FS.
     */

  }, {
    key: "generateHandlers",
    value: function () {
      var _generateHandlers = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee9() {
        var _this4 = this;

        var handlersFullDirPath;
        return _regeneratorRuntime.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                handlersFullDirPath = path.join(this.originalServicePath, this.config().handlersDirName);
                _context9.prev = 1;
                mkdir(handlersFullDirPath);
                _context9.next = 9;
                break;

              case 5:
                _context9.prev = 5;
                _context9.t0 = _context9["catch"](1);

                if (!(_context9.t0.code !== 'EEXIST')) {
                  _context9.next = 9;
                  break;
                }

                throw _context9.t0;

              case 9:
                _context9.next = 11;
                return Promise.all(this.funcs.map(
                /*#__PURE__*/
                function () {
                  var _ref4 = _asyncToGenerator(
                  /*#__PURE__*/
                  _regeneratorRuntime.mark(function _callee8(func) {
                    var handlerCode;
                    return _regeneratorRuntime.wrap(function _callee8$(_context8) {
                      while (1) {
                        switch (_context8.prev = _context8.next) {
                          case 0:
                            if (_this4.config().wrapper) {
                              if (!func.epsagon) {
                                // eslint-disable-next-line no-param-reassign
                                func.epsagon = {};
                              } // eslint-disable-next-line no-param-reassign


                              func.epsagon.wrapper = _this4.config().wrapper;
                            }

                            handlerCode = generateWrapperCode(func, _this4.config({
                              funcName: func.key
                            }));
                            _context8.next = 4;
                            return writeFile(path.join(handlersFullDirPath, generateWrapperExt(func)), handlerCode);

                          case 4:
                          case "end":
                            return _context8.stop();
                        }
                      }
                    }, _callee8);
                  }));

                  return function (_x3) {
                    return _ref4.apply(this, arguments);
                  };
                }()));

              case 11:
              case "end":
                return _context9.stop();
            }
          }
        }, _callee9, this, [[1, 5]]);
      }));

      function generateHandlers() {
        return _generateHandlers.apply(this, arguments);
      }

      return generateHandlers;
    }()
    /**
     * Replaces the functions original handlers with Epsagon's handlers.
     * In addition making sure epsagon_handlers are present.
     */

  }, {
    key: "assignHandlers",
    value: function assignHandlers() {
      var _this5 = this;

      this.funcs.forEach(function (func) {
        var handlerPath = `${_this5.config().handlersDirName.replace('\\', '/')}/${func.epsagonHandler}`;
        var serviceFunc = _this5.sls.service.functions[func.key];
        serviceFunc.handler = `${handlerPath}.${func.method}`; // Adding handler to include (in case it was excluded).

        if (_.isObject(serviceFunc.package) && _.isObject(serviceFunc.package.include)) {
          serviceFunc.package.include = [].concat(_toConsumableArray(serviceFunc.package.include), [handlerPath]);
        }
      }); // Adding the general epsagon_handlers dir to include (in case it was excluded).

      if (_.isObject(this.sls.service.package.include)) {
        this.sls.service.package.include = [].concat(_toConsumableArray(this.sls.service.package.include), [`${this.config().handlersDirName.replace('\\', '/')}/**`]);
      }
    }
    /**
     * Gets the plugin config.
     * @returns {Object} The config object
     */

  }, {
    key: "config",
    value: function config() {
      var _ref5 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          _ref5$funcName = _ref5.funcName,
          funcName = _ref5$funcName === void 0 ? '' : _ref5$funcName;

      var funcs = this.sls.service.functions || {};
      var funcConfig = (funcs[funcName] || {}).epsagon || {};
      var epsagonConfig = (this.sls.service.custom || {}).epsagon || {};
      return _objectSpread({
        metadataOnly: 'false',
        handlersDirName: 'epsagon_handlers'
      }, epsagonConfig, funcConfig);
    }
    /**
     * Cleaning Epsagon's handlers
     */

  }, {
    key: "cleanup",
    value: function cleanup() {
      this.log('Cleaning up Epsagon\'s handlers');
      fs.removeSync(path.join(this.originalServicePath, this.config().handlersDirName));
    }
  }]);

  return ServerlessEpsagonPlugin;
}();

module.exports = ServerlessEpsagonPlugin;
