## Axios系列之配置化

### 1. 使用场景


### 2. 如何使用


### 3. 如何实现


### 4. 总结

通过这章节的源码分析，我们可以看一下axios的配置化，涉及了哪些部分，以及是如何实现的？

1. 

**1）定义配置项**

defaults.js
定义了请求所需用到默认配置，包括默认的`transformRequest` 、`transformResponse`、`timeout`、`headers`配置等

```javascript
var defaults = {
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    /*eslint no-param-reassign:0*/
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,
  maxBodyLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
};

defaults.headers = {
  common: {
    'Accept': 'application/json, text/plain, */*'
  }
};

utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});

module.exports = defaults;

```
这里先对默认的配置，以及默认的配置处理有个印象，稍后会讲到具体讲到transformRequest和transformResponse这两个配置项。

**2）将配置项传给Axios**

axios.js
```javascript
var defaults = require('./defaults');
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);

  // ...
  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);
```
可以看到，在调用axios时，即调用createInstance时，会静默的传入默认配置defaults，并自动合并。用户只需要关注自己传入的config即可。

**3）对于不同的配置项，采用不同的合并策略**

调用 `axios` 方法时，会传入自定义配置项 `config` ，在 `request` 方法的内部，会将默认的和自定义的配置项，通过 `mergeConfig` 函数，进行合并。

/core/Axios.js
```javascript
var mergeConfig = require('./mergeConfig');
function Axios(instanceConfig) {
  this.defaults = instanceConfig;

  // ...
}
Axios.prototype.request = function request(config) {
  // ...

  // mergeConfig 函数
  config = mergeConfig(this.defaults, config);

  // ...
```

接下来，我们看下具体的合并策略：

core/mergeConfig.js
```javascript
module.exports = function mergeConfig(config1, config2) {
  config2 = config2 || {};
  var config = {};

  var valueFromConfig2Keys = ['url', 'method', 'data'];
  var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy', 'params'];
  var defaultToConfig2Keys = [
    'baseURL', 'transformRequest', 'transformResponse', 'paramsSerializer',
    'timeout', 'timeoutMessage', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
    'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress', 'decompress',
    'maxContentLength', 'maxBodyLength', 'maxRedirects', 'transport', 'httpAgent',
    'httpsAgent', 'cancelToken', 'socketPath', 'responseEncoding'
  ];
  var directMergeKeys = ['validateStatus'];

  // 通过对config1和config2的属性遍历，执行getMergedValue进行合并
  function getMergedValue(target, source) {
    if (utils.isPlainObject(target) && utils.isPlainObject(source)) {
      return utils.merge(target, source);
    } else if (utils.isPlainObject(source)) {
      return utils.merge({}, source);
    } else if (utils.isArray(source)) {
      return source.slice();
    }
    return source;
  }

  function mergeDeepProperties(prop) {
    if (!utils.isUndefined(config2[prop])) {
      config[prop] = getMergedValue(config1[prop], config2[prop]);
    } else if (!utils.isUndefined(config1[prop])) {
      config[prop] = getMergedValue(undefined, config1[prop]);
    }
  }

  // 只取自定义配置项的值
  utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
    if (!utils.isUndefined(config2[prop])) {
      config[prop] = getMergedValue(undefined, config2[prop]);
    }
  });

  // 需深度遍历进行合并
  utils.forEach(mergeDeepPropertiesKeys, mergeDeepProperties);
  
  // 优先取自定义的值，再取默认配置的值
  utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
    if (!utils.isUndefined(config2[prop])) {
      config[prop] = getMergedValue(undefined, config2[prop]);
    } else if (!utils.isUndefined(config1[prop])) {
      config[prop] = getMergedValue(undefined, config1[prop]);
    }
  });

  utils.forEach(directMergeKeys, function merge(prop) {
    if (prop in config2) {
      config[prop] = getMergedValue(config1[prop], config2[prop]);
    } else if (prop in config1) {
      config[prop] = getMergedValue(undefined, config1[prop]);
    }
  });

  var axiosKeys = valueFromConfig2Keys
    .concat(mergeDeepPropertiesKeys)
    .concat(defaultToConfig2Keys)
    .concat(directMergeKeys);

  var otherKeys = Object
    .keys(config1)
    .concat(Object.keys(config2))
    .filter(function filterAxiosKeys(key) {
      return axiosKeys.indexOf(key) === -1;
    });

  utils.forEach(otherKeys, mergeDeepProperties);

  return config;
};
```

配置合并的整体思路：对 `config1` 和 `config2` 中的属性遍历，通过调用核心方法`getMergedValue` 方法做合并，这里的 `config1` 代表默认配置，`config2` 代表自定义配置。

对 `config` 中不同的 `key` ，分别做了不同的合并策略：
- 定义在变量 `valueFromConfig2Keys` 中的属性，如：`url` 、 `method` 、 `data`，只会取自定义配置中的值，因为这些属性，从默认配置中取没有意义。
- 定义在变量 `defaultToConfig2Keys` 中的属性，如：`baseURL` 、 `transformRequest`, `transformResponse` 等，会优先取自定义的值，再取默认配置的值。
- 定义在变量 `mergeDeepPropertiesKeys` 中的复杂属性，如：`headers` 、`auth` 等，需要用深拷贝的方法 `mergeDeepProperties` 对其分别进行处理。

我的理解是：

转换器和拦截器的最大的区别之一，transformer里面只能“同步”操作，interceptor里面可以“异步”。
请求转换器（transformRequest）主要用来根据data格式，设置http请求头；
响应转换器（transformResponse）可以根据实际业务中服务端返回的数据格式，统一设置转换方法。
拦截器是被包装成了Promise，显然主要是想用它来处理异步的。

汇总下就是：
转换器是处理数据和请求头的，不能处理异步，不会阻断请求和响应流程；
拦截器可以处理异步需求，可以使用拦截器阻断请求或响应流程。
  









