# Axios系列之扩展接口

## 一、扩展接口
**【解决问题】** 直接调用axios方法，通过config来指定请求的method（get、post）、url、data等属性，开发者使用起来会较为繁琐，我们可以通过拓展一些接口，从而可直接调用axios.get()、axios.post()等。

**【设计思路】**
关键思路：axios本身是一个方法，直接供外层调用，它还含有很多的方法属性。因此，更像是一个混合对象。那接下来的问题是，我们应该如何来实现这个混合对象？

1. 先从类型突破：定义继承Axios的AxiosInstance接口
   
```typescript
  export interface AxiosInstance extends Axios {
    // 只有一个参数
    <T = any>(config: AxiosRequestConfig): AxiosPromise<T>
    // 两个参数
    // config-非必填参数，如果没有传，默认是get方式
    <T = any>(url: string, config?: AxiosRequestConfig): AxiosPromise<T>
  }
```
   
2. 创建辅助函数extend：用于把 from 里的属性都扩展到 to 中，包括原型上的属性。

```typescript
export function extend<T, U>(to: T, from: U): T & U {
  for (const key in from) {
    ;(to as T & U)[key] = from[key] as any
  }
  return to as T & U
}
```

3. 核心的工厂方法createInstance，创建混合对象：
   - 实例化 `Axios` 类对象 `context` ，创建 `instance` 指向 `Axios.prototype.request` 方法，并绑定了 `context` 上下文，使外部直接调用 `axios` 方法时，相当于调用了 `request` 方法。
   - 另外，再将context上的原型方法和实例方法全部都拷贝到instance上，这样，instance既有了request、get、post等属性，外部也可以直接通过axios.get()等方式直接调用。

```typescript
function createInstance(config: AxiosRequestConfig): AxiosInstance {
  const context = new Axios(config)
  const instance = Axios.prototype.request.bind(context)
  extend(instance, context)
  return instance as AxiosInstance
}
const axios = createInstance(defaults)
```

## 二、实现axios函数的重载
**【解决问题】**  
从需求上来看，我们想要实现axios函数，既可以传入1个参数-config（指定请求的url和method等），也可传入两个参数-url，config（还需在config中指定请求的method）

**【解决关键】** 
1. 采用函数重载的方式
2. 外部调用的axios方法，其实质是调用Axios类中的request方法，因此，将问题转化为在axios函数中如何实现函数的重载。
   
**【解决思路】**  函数重载的关键思想，根据参数类型，寻找突破口，如: 第一个参数url是字符串，那么默认它符合会传两个参数的情况；否则，视为只传了一个参数。

**【注意】**  
1. 在对request函数实现函数重载的同时，Axios类接口中的request的描述，并未修改成两个参数 => 这可理解成：仅是对函数内部的实现做了修改，与对外接口不必保持一致，只需要保留兼容即可。
2. 注意传入的参数类型

实现重载后的request函数：
``` typescript
request(url: any, config?: any): AxiosPromise {
  // 只有一个参数，参数为url的情况
  if (typeof url === 'string') {
      if (!config) {
          config = {}
      }
      config.url = url
  } else {
      // 两个参数
      config = url
  }
  // ...
}
```

## 三、响应数据支持泛型
**【解决问题】**  我们希望为后端返回的数据，通过接口描述并制定数据类型。这样我们在使用axios返回的res数据时，就可以知道res里有哪些数据，且数据具体的类型。

--> 但是ts不会就这个类型进行校验？？？这么做的意义何在？？
优先通过接口定义数据类型 -> 请求时传入定义的接口 -> 响应时可获取结果的数据类型。