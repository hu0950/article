## Axios源码解析系列之请求配置

阅读完该章内容，你将会了解到以下内容:
- 传入请求的自定义配置和默认配置是如何做合并的？
- 请求转换器和响应转换器的配置化是如何实现的？

### 自定义配置和默认配置的合并

通常情况下，我们在正常发送一个请求的时候，都可以传入一个配置，以此来决定请求的具体内容以及不同的行为。

`Axios` 提供了一套默认的配置，定义了一些默认的行为。这样，在每次发请求时，都会将用户所传入的配置和默认的配置进行一次合并，当然，这个合并工作，对不同的配置项，所做的处理策略是不一样的，本文将在以下具体会讲到。

**1）定义默认的配置项**

源码目录：/defaults.js

在该文件中，定义了一个正常的请求，所需用到默认配置，包括默认的`transformRequest` 、`transformResponse`、`timeout`、`headers`配置等。

```javascript
var defaults = {
  adapter: getDefaultAdapter(),

  // 支持将请求数据发送到服务器之前对其进行修改
  transformRequest: [function transformRequest(data, headers) {
    console.log(typeof data)
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

  // 支持将响应数据传给then或者是catch之前进行修改
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

// ...
module.exports = defaults;
```
这里先对默认的配置，以及默认的配置处理有个印象，后续的章节会具体讲到`transformRequest` 和 `transformResponse` 这两个配置项。

**2）将配置项传给Axios**

源码目录：/axios.js

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
可以看到，在调用axios时，会传入默认配置defaults，并自动合并，用户只需要关注自己传入的config即可。

**3）对于不同的配置项，采用不同的合并策略**

调用 `axios` 方法时，会传入自定义配置项 `config` ，比如：`axios(config)`，但在 `request` 方法的内部，会自动将默认的和传入自定义的配置项，通过 `mergeConfig` 函数，进行合并。

源码目录：/core/Axios.js

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

接下来，我们看下核心方法 `mergeConfig` ，具体做了哪些合并策略？

源码目录：core/mergeConfig.js

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

以上的代码很长，我们来简单地梳理一下，配置合并的整体思路：对 `config1` 和 `config2` 中的属性进行遍历，通过调用核心方法`getMergedValue` 方法做合并，这里的 `config1` 代表默认配置，`config2` 代表自定义配置。

其次，对不同的配置属性，分别做了不同的合并策略：
- 属于 `valueFromConfig2Keys` 类型的属性，如：`url` 、 `method` 、 `data`，只会取自定义配置中的值，因为这些属性，从默认配置中取没有意义。
- 属于 `defaultToConfig2Keys` 类型的属性，如：`baseURL` 、 `transformRequest`, `transformResponse` 等，会优先取自定义的值，再取默认配置的值。
- 属于 `mergeDeepPropertiesKeys` 的复杂属性，如：`headers` 、`auth` 等，需要用深拷贝的方法 `mergeDeepProperties` 对其分别进行处理。这里，对于如果进行深度合并的，就不做过多的解析，具体的相关代码，可在源码中找到答案。

### 请求转换器和响应转换器的配置化

请求转换器主要是在将数据发送到服务器之前，对请求数据，即 `config.data` 进行修改，由于类似于 `get` 请求，即使传入了 `config.data`，也无法通过请求体的方式传递数据，因此，这只适用于请求方法 `put`、`post` 和 `patch` 方法。

而通过请求转换器，可以在传递给 `then` 或者 `catch` 之前，对返回的数据进行处理。

**1）默认配置中的转换器做了什么？**

在默认配置中，所设置的请求转换器和响应转换器，分别是 `transformRequest` 和 `transformResponse` ，它们的值各自都是一个数组。

源码目录：/defaults.js

```javascript
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
}]
```
默认请求转换器主要做的事情是：根据对传入的 `config.data` 值类型的不同，处理成对应的数据，以及对请求的 `headers` 进行相应的处理，包括对 `Accept` 和 `Content-Type` 进行标准化。

```javascript
// 支持将响应数据传给then或者是catch之前进行修改
transformResponse: [function transformResponse(data) {
  /*eslint no-param-reassign:0*/
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) { /* Ignore */ }
  }
  return data;
}]
```
默认响应请求转换器主要做的事情是：如果返回的数据是一个字符串类型，尝试性地将它转换成JSON对象，否则，返回原本的结果。

**2）转换器的用法**

在默认转换器 `axios.defaults.transformRequest` 和 `axios.defaults.transformRequest` 的基础上，还可以添加自定义的转换器，进行相应的逻辑处理。

```javascript
axios.post('/config/post', {
  transformRequest: [
    function(data) {
      return JSON.parse(data)
    },
    ...axios.defaults.transformRequest
  ],
  transformResponse: [
    ...axios.defaults.transformResponse,
    function(response) {
      return response.data
    }
  ],
  data: '{ a: 1, b: 1 }'
}).then(res => {
  // ...
})
```

之前也提到，这里的 `transformRequest` 和 `transformResponse` 是一个数组，而数组中的每项都是一个转换函数 。这模式类似一个管道，数组中的函数会依次执行，而前者会作为后者的入参。

**3）如何实现？**

源码目录：/dispatchRequest.js

```javascript
module.exports = function dispatchRequest(config) {
  // ...

  // 对config.data 进行转换处理
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );

  // ...
  
  return adapter(config).then(function onAdapterResolution(response) {
    // ...

    // 对response.data 进行转换处理
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // 对response.data 进行转换处理
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }
    return Promise.reject(reason);
  });
};

```
`dispatchRequest` 是发送请求的核心函数，主要做了三件事：
- 对请求数据的转换
- 请求适配器决定根据环境来确定使用哪种方法请求
- 对响应数据的转换

这里，分别将请求数据 `config.data` 和 响应数据 `response.data`，以及对应的 `headers` 和 `转换器数组集合`， 传入 `transformData` 函数，分别进行处理，再将处理的结果，作为新的数据返回。

我们再来看一下 `transformData` 函数内部的处理逻辑：

> 源码目录：/lib/transformData.js

```javascript
module.exports = function transformData(data, headers, fns) {
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};
```
这个函数主要做的是：遍历当前所有的转换器 `fns`，逐个执行这些转换器，并传入 `data` 和 `headers` ，每次转换函数处理完返回的结果 `data` ，都会作为下一个转换器入参 `data` ，至到转换器遍历完毕，返回最后 `data` 。

这样，外部接收到经过 `transformData` 函数处理的 `config.data` 和 `resonpse.data` 都是经过各自所有转换器处理完的结果。

> 转换器和拦截器的区别

总的来说，转换器和拦截器，对于一个请求来说，它们的处理时机都是相同的，都是可以在请求前以及响应后，进行相应的处理，那它们在使用上有什么区别呢？

请求转换器（transformRequest）主要用来对 `data` 进行处理，和 `http` 请求头进行设置。
响应转换器（transformResponse）可以根据实际业务中服务端返回的数据格式，统一设置转换方法。
转换器和拦截器的最大的区别之一，转换器里只能进行“同步”操作，而拦截器是被包装成了 `Promise`，它可用来处理异步逻辑。

另外一个区别在于处理函数的参数：
请求拦截器：config
请求转换器：config.data
响应转换器：response.data
响应拦截器：response

总结一下，拦截器主要是用来处理请求配置，而转换器主要是用来处理请求体数据的。因此，可以根据你所想要处理的数据，选择不同的方式来处理。









