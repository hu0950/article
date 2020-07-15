# 如何重构一个过万 star 的开源项目—BetterScroll 2.0

## 过去的 v1 时代

距离 BetterScroll v1 版本发布，至今已经 3 年多，由于它在移动端良好的滚动体验与性能以及多种滚动场景的支持，深受社区的青睐。用户也可以基于 BetterScroll 抽象出各种复杂的业务滚动组件，期间依托于 BetterScroll，我们还开源了基于 Vue2.0 的移动端组件库 [cube-ui](https://github.com/didi/cube-ui)。

目前 BetterScroll 的 star 数已经超过 1.1 万，GitHub 有大约 3.2 万仓库使用了它。**滴滴**内部的业务，比如**国内司乘两端**、**国外司乘两端**等核心业务都大量使用 BetterScroll，它经受住了各种业务场景的考验。

随着大量的业务场景使用以及社区的反馈与建议，v1 版本也暴露了一些问题，主要分为如下四个方面：

- **包体积大，无法按需引用**
- **扩展困难，增强功能易侵入核心逻辑**
- **测试匮乏，稳定性保证差**
- **文档不够友好，社区答疑成本高**

## v2 将至

先来看下最终的整体 BetterScroll v2 版本的架构图：

![BetterScroll v2 架构图](https://dpubstatic.udache.com/static/dpubimg/a6a89016-3a33-471b-83cc-d50bdd441c7b.png)

从整体架构图可以看出，目前整体 BetterScroll v2 版本除了实现核心滚动外，还额外提供很多插件：

- **picker**
  高仿 iOS 原生 Picker 组件。
- **mouse-wheel**
  兼容 PC 鼠标滚轮场景
- **mouse-wheel**
  兼容 PC 鼠标滚轮场景
- **observe-dom**
  自动探测 scroll 区域 DOM 改变，并且调用 refresh 方法。
- **pulldown**
  监听下拉动作
- **pullup**
  监听上拉触底动作
- **scrollbar**
  仿原生浏览器，且样式美观的滚动条
- **slide**
  实现轮播图交互效果
- **zoom**
  提供缩放能力
- **nested-scroll**
  协调双层嵌套的滚动行为。
- **infinity**
  无限滚动列表（多用于大量数据渲染，否则 coreScroll 即可满足需求）

v2 版本的诞生就是为了解决 v1 暴露出来的问题，这里我们将从上面的四个问题分别来揭秘重构过程中的思考与实践。

### 1、包体积大

v1 的架构设计借鉴于 Vue 2.0 的代码组织方式，但是由于不同的 Feature(`picker、slide、scrollbar 等`) 都是与核心滚动写在一起，导致无法**按需引入**。

> **备注**：此处的**按需引入**指的是用户可能只需要实现简单的列表滚动效果，却*被迫*加载冗余代码，比如所有 Feature 的代码，造成包体积过大的问题。

为了解决这个问题，我们就必须找到一种一种合理的方式将各个 Feature 代码单独拆分，独立引用，答案就是**插件化**方案。那么 v2 版本的一个核心关键点就是**如何设计插件化的机制**，我们当时是从下面三个步骤来思考的：

  1. 核心功能抽象，从核心滚动（CoreScroll）自顶向下地拆分出多个职能单一的类，进而将它们组合在一起构建完整核心逻辑；

  ![核心滚动类](https://raw.githubusercontent.com/theniceangel/images/master/QQ20191217-165105%402x.png)

  由于拆分成细粒度的功能类，考虑到老用户监听事件或者获取属性都是操纵 CoreScroll，我们内部有统一的[事件冒泡层](https://github.com/ustbhuangyi/better-scroll/blob/dev/packages/core/src/utils/bubbling.ts)以及[属性代理层](https://github.com/ustbhuangyi/better-scroll/blob/dev/packages/shared-utils/src/propertiesProxy.ts)，将内部类的事件或者属性都代理到 CoreScroll 上。

  2. 借鉴 **webpack tapable** 延伸出来的 `hooks` 的概念（并不需要 tapable 那么强大），职能类之间通过 `hooks`(即 EventEmitter 经典的订阅发布者模式增强版) 来处理流程中钩子逻辑；

  3. 借鉴 **Vue 2.x** 插件注册机制（代码如下），减少老用户的心智负担。

      ```js
      import BScroll from '@better-scroll/core'
      import Slide from '@better-scroll/slide'

      // 只需注册插件即可，无额外心智负担
      BScroll.use(Slide)

      let bs = new BScroll('.wrapper', {
        slide: { /* 插件配置项 */ }
      })
      ```

因此 v2 的整体雏形就已经好了，考虑到后期会有很多插件实现不同的业务场景需求，v2 版本采用了 [Lerna](https://github.com/lerna/lerna) 来管理多个包，使用 `@better-scroll` 作为包的命名前缀，这样对于用户来说有更好的辨识度。[TypeScript](https://www.typescriptlang.org/) 的静态类型，加上整个的社区十分成熟丰富的生态，BetterScroll 本身 Feature 已经很多，且未来还会继续增加，综合看非常适合用 TypeScript 进行开发。

> TIPS:
>
> Lerna 发包失败始终是开发者(包括作者)绕不过去的话题，目前也有很多 issue 与博客在讨论这个问题，供参考：[lerna 发布失败后的解决方案](https://github.com/huruji/blog/issues/67)、[lerna issue 1894](https://github.com/lerna/lerna/issues/1894)、[publish 失败问题](https://github.com/9-web/zet-component/issues/41)

### 2、扩展困难

v1 版本新增 Feature 的时候，有些逻辑代码是与核心滚动代码糅合在一起，造成后期扩展可维护性都会慢慢降低，随之而来的也有包体积无限制的增加。那么如果将 Feature 与 核心滚动 CoreScroll 部分进行彻底分离，将 Feature 做成插件的模式，既能解决包体积的问题，扩展也变得相对容易，迭代的稳定性也变好了。

在 v2 版本中，一个插件的一般实现如下：

```typescript
class InfinityScroll {
  static pluginName = 'infinity'
  constructor(public bscroll: BScroll) {
    // ...your own logic
  }
}
// 假设已经注册了 InfinityScroll
new BScroll('.wrapper', {
  infinity: { /* 插件配置项 */ }
  // infinity 要与插件的 pluginName 对应上
})
```

插件**必须**拥有一个静态属性 **pluginName**，这个属性对应的值必须与初始化 BetterScroll 传入的配置对象的 **key** 对应，否则内部查找不到对应的插件。这个方案充分考虑了开发者使用时候的成本，同时也尽量降低和 v1 版本的差异。

在实现了核心的插件机制后，对于各种 Feature 则是通过一个个插件的形式来丰富 BetterScroll 的整体生态。

### 3、测试匮乏

在 v1 版本中，测试覆盖率不到 40%，可能也是因为 BetterScroll 在之前是一个巨大的类，编写单元测试也逐渐地困难了起来，这样在后期迭代升级的时候会埋下隐患，这也就是所说的**稳定性保证差**。

那么在 v2 版本，为了保证整体功能的稳定性，控制发版质量，我们不但添加了**单元测试**，还额外引入了**功能测试**做进一步保障。

  1. **单元测试**

      之前参与的 [cube-ui](https://github.com/didi/cube-ui) 的单测是采用 `karma + mocha` 的方案，不过需要安装**各种插件**，还需要做不少配置。已经 9102 年了，最终调研对比发现在现有的 BetterScroll 场景中使用 [Jest](https://github.com/facebook/jest) 作为测试框架是合适的，它本身集成了 `Mock`、`Test Runner`、`Snapshot` 等强大的功能，基本上算是开箱即用，很好的满足需要。

      在编写单元测试过程中，用的最多是强大的 [manual-mocks](https://jestjs.io/docs/en/manual-mocks) 能力。

      举个简单的场景来深入浅出地阐述我们对**单元测试**的看法以及如何借助 **Jest manual-mocks** 解决问题。

      假如我们的源码文件结构如下：

      ```markup
      - src
        - Core.ts
        - Helper.ts
      ```

      `Core` 与 `Helper` 的代码如下：

      ```typescript
      // Core.ts 代码如下

      export default class Core {
        constructor (helper: Helper) {
          this.helper = helper
        }

        getHammer (type: string) {
          if (this.helper.isHammer(type)) {
            return ('Got hammer')
          } else {
            return ('No hammer is available')
          }
        }
      }

      // Helper.ts 代码如下

      export default class Helper {
        isHammer (type: string) {
          return type === 'hammer'
        }
      }
      ```

      准备工作就绪，现在要开始测试 `Core#getHammer` 函数，这时我们核心开发成员之间发出了两种不同的声音。

      **方案一**：导入 `Helper` 原始代码（即 `src/Helper.ts`），让其走全流程；

      **方案二**：单元测试应该以函数或者类作为最小的粒度，做法倾向于传统的测试行业的概念，认为 `Helper` 应该被 mock 掉（使用 `src/__mocks__/Helper.ts`），换句话来说， `Helper` 作为另外一个测试单元，它必须保证自己的功能完全正确，但对于 `Core.ts` 的单测，不应该引入原始的 `Helper`。

      最后的最后，我们选择了更为严谨的**方案二**。

      借助于 Jest [manual-mocks](https://jestjs.io/docs/en/manual-mocks) 的能力，编写测试就变得更愉快与明确了。

      1. 更改文件结构

          ```diff
          src
          + __mocks__
          +   Helper.ts
          + __tests__
          +   Core.spec.ts
            Core.ts
            Helper.ts
          ```

          加了目录 `__mocks__` 以及 `__mocks__/Helper.ts` 文件，并且加了测试目录 `__tests__` 与 `Core.spec.ts`。

      2. 完善 manual-mocks

          ```typescript
          // __mocks__/Helper.ts
          const Helper = jest.fn().mockImplementation(() => {
            return {
              isHammer: jest.fn().mockImplementation((type) => {
                return type === 'MockedHammer'
              })
            }
          })
          export default Helper
          ```

      3. 编写 Core.spec.ts

          ```typescript
          import Helper from '../Helper.ts'
          import Core from '../Core.ts'
          // 使用 '__mocks__/Helper.ts'
          // 引入的 Helper 就是 mock 处理过的～
          jest.mock('../Helper.ts')

          describe('Core tests', () => {
            it('should work well with "MockedHammer"', () => {

              const core = new Core(new Helper() // Mock 过后的 Helper)

              expect(core.getHammer('MockedHammer')).toBe('Got hammer') // 通过
            })
          })
          ```

          从上述可以看出，我们利用 Jest 更改了 `Helper.ts` 的导出，用的是 `__mocks__` 目录下的，不再是原始的 `Helper.ts`，这样各个模块自身需要保障自身逻辑正确性，同时对于异常分支的逻辑测试会变得更容易。

          **很有趣, 对吧?**

  2. **功能测试**

      由于 BetterScroll 是一个与浏览器强相关的滚动库，单元测试是用来保证单个模块的**输入输出**正确性，所以还需要其他的手段来保证核心滚动、插件等的行为表现符合预期，因此我们就采用了 [jest-puppeteer](https://github.com/smooth-code/jest-puppeteer)，它的理念就是 **Run your tests using Jest & Puppeteer**，这里有必要介绍一下 [Puppeteer](https://github.com/puppeteer/puppeteer)。

      > Puppeteer is a Node library which provides a high-level API to control Chrome or Chromium over the [DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

      用我的工地英语翻译一下就是：

      > Puppeteer 是一个通过 DevTools 协议控制 Chrome 行为并且提供更优雅的 API 的 Node 类库。

      **DevTools** 这个协议很重要，接下来仍会提及到。

      你打开它的官网会发现，它的功能有很多，包括**生成 PDF**、**表单、UI 测试**、**谷歌插件测试**等等，网上也有很多文章介绍如何使用它来做**爬虫**。

      下面截取核心滚动的功能测试片段代码：

      ```typescript
      describe('CoreScroll/vertical', () => {
        beforeAll(async () => {
          await page.goto('http://0.0.0.0:8932/#/core/default')
        })

        it('should render corrent DOM', async () => {
          const wrapper = await page.$('.scroll-wrapper')
          const content = await page.$('.scroll-content')

          expect(wrapper).toBeTruthy()
          await expect(content).toBeTruthy()
        })

        it('should trigger eventListener when click wrapper DOM', async () => {
          let mockHandler = jest.fn()
          page.once('dialog', async dialog => {
            mockHandler()
            await dialog.dismiss()
          })

          // wait for router transition ends
          await page.waitFor(1000)
          await page.touchscreen.tap(100, 100)

          await expect(mockHandler).toHaveBeenCalled()
        })
      })
      ```

      从上边的示例代码可以看到，Puppeteer 的 API 都是非常语义化的，而且内部的 API 都是返回 Promise。

      在逐渐丰富功能测试的时候，还是很愉快的，但是**难题**还是不期而遇。

      **BetterScroll 功能测试强相关联 Touch、Mouse、MouseWheel 等事件，然而此时的 Puppeteer(v1.17.0) 并没有提供全部的接口。**

      **既然 Puppeteer 是一个通过协议控制 Chrome 的类库，那为啥不把它内部的实现先粗略的了解一下呢？**

      秉着这个想法，在研究了 Puppeteer 的核心实现，最终整理发现，只要理清一条主线，其余的是照葫芦画瓢、参考 [DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) 文档即可。

      下面是简略的流程图。

      ![示例](https://raw.githubusercontent.com/theniceangel/images/master/WX20191217-141111%402x.png)

      **第一步**：利用 node 的 child_process 模块启动 `Chromium`;

      **第二步**：监听命令行的输出，获取 `browserWSEndpoint`，它是一个 URL 地址，传给 WebSocket，这样 Puppeteer 与 Chromium 的双向推送关系就建立了；

      **第三步**：实例化 Connection，建立 Session 会话以及 实例化 Browser 类，那么用户操作的都是这个 browser 实例，比如打开一个页面标签(`browser.newPage()`)。在实例化 Connection 的内部，其实有很多细节，[DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) 就是现成的 API 文档，换句话来说，只要我们按着这个 API 文档通过 WebSocket 给 Chromium 去发消息，就能驱使它作出响应的行为。

      接下来结合文档以及源码，我们发现只要发送 `Input.synthesizePinchGesture` 以及 `Input.synthesizeScrollGesture` 消息（[文档在这](https://chromedevtools.github.io/devtools-protocol/tot/Input#method-synthesizeScrollGesture)），就能驱使 Chromium 作出 scroll、 zoom、mouseWheel 等事件交互效果，那么对于 BetterScroll 的各种插件以及核心滚动的功能测试就手到擒来啦！

      因此，我们对 Puppeteer 做了部分扩展，[extendTouch](https://github.com/ustbhuangyi/better-scroll/blob/dev/tests/util/extendTouch.ts)、[extendMouseWheel](https://github.com/ustbhuangyi/better-scroll/blob/dev/tests/util/extendMouseWheel.ts) 以满足功能测试需要。

      那么功能测试的写的任务就算可以全部完成啦。

      功能测试算是告一段落了，但是**新问题**又出现了：跑功能测试，是依赖 examples 下的代码来启动服务，然后在用 Puppeteer 去访问示例代码的服务，最后跑所有的测试用例。也就意味着跑功能测试就需要先把服务准备好，再跑功能测试，这里我们需要一种更为**工程化**的手段来解决这个问题！

      这个问题的关键是**怎么确保 examples 代码的服务启动再跑功能测试**，那么是不是可以从 `webpack` 下手，尤其是 `webpackDevServer`。通过研究它的源码实现，发现内部引用的 [webpack-dev-middleware](https://github.com/webpack/webpack-dev-middleware#waituntilvalidcallback)，其中有一个 API，叫做 `waitUntilValid`，接收一个 `callback`。这个 API 能保证服务已经启动并且 bundle 是可访问的。

      那么解决方案就如下，在 `vue.config.js` 注入 webpack 的 配置：

      ```js
      module.exports.configureWebpack = {
        devServer: {
          before (app, server) {
            server.middleware.waitUntilValid(() => {
              // 服务已经 ready，启动 e2e 测试
              execa('npm', ['run', 'test:e2e'], { stdio: 'inherit' })
            })
          }
        }
      }
      ```

至此，这就是测试部分的探索以及实践，做完这部分，对我们自身而言，有个最大的体会：**工程师的价值在于探索与解决问题**。

### 4、文档不够友好

v1 版本的文档以及示例代码颇受吐槽，尤其是示例部分给了新入坑的小伙伴们很大的心智负担，比如文档内部没有实际代码片段、示例耦合各种无关的 Vue 逻辑。在 v2，这些问题将会得到改善。

首先由于我们的技术栈是 Vue，其周边 [VuePress](https://vuepress.vuejs.org/) 则是一个很好用的文档框架，它将 Vue、webpack、Markdown 的能力发挥到极致，也能很好的定制主题、实现国际化，并且它插件化的架构设计给 VuePress 带来了很大的灵活性以及扩展能力，所以我们就选型了 VuePress 来完成相关 API 文档化。尽管 VuePress 开箱即用，基本满足我们编写文档的大部分要求，但仍然需要额外的一些扩展。

![示例](https://raw.githubusercontent.com/theniceangel/images/master/QQ20191217-154447%402x.png)

这里想要实现上面图片的功能，要有**二维码**，**组件的代码片段**，**要把 examples 目录下的组件真正渲染在 markdown 里面**。第一和第三点都特别好实现，VuePress 提供这能力，但是第二点，**在 markdown 同步展示 examples 组件对应的代码**，这是个棘手的问题。

那么，深入研究 VuePress 的实现是必要的，VuePress 内部是使用 [markdown-it](https://github.com/markdown-it/markdown-it) 来编译 `md` 扩展名的文件。要解决这个问题，看来需要深入研究下 markdown-it 的底层实现，也顺道产出了 [markdown-it 源码以及插件的解读系列](https://github.com/theniceangel/markdown-it-analysis)；发现基于 VuePress 的插件机制可以满足我们定制化的需求，因此写了 [extract-code](https://github.com/ustbhuangyi/better-scroll/blob/dev/packages/vuepress-docs/docs/.vuepress/plugins/extract-code.js) 插件，并约定 markdown 文件只要如下的代码，那么就会被 `extract-code` 处理。

```
// 抽取 default.vue 文件的 template 标签内容
<<< @/examples/vue/components/infinity/default.vue?template
// 抽取 default.vue 文件的 script 标签内容
<<< @/examples/vue/components/infinity/default.vue?script
```

如此一来，我们每次更改 examples 下面的示例代码，文档也会同步更新到对应的部分。

> 注意：
> 由于 VuePress 为了加快 markdown 文件的编译速度，内部使用 [cache-loader](https://github.com/webpack-contrib/cache-loader) 做缓存，意思是如果 markdown 内容没有发生变化，直接取缓存的内容，虽然示例代码变化，但是对于 markdown 文件来说，内容其实是未改变的。


> TIPS:
> 如果你不喜欢代码块的主题，可以研究下大名鼎鼎的 [prism](https://github.com/PrismJS/prism)，因为 VuePress 的内部就是用这个插件去做高亮的。

## 总结规划

回顾我们在做 BetterScroll 2.0 版本的大体历程，一路虽有坎坷，但更多的是收获、总结和沉淀。

当然，这一切都是团队内同学的共同努力，核心同学：[嵇智](https://github.com/theniceangel)、[冯伟尧](https://github.com/tank0317)、[崔静](https://github.com/cuijing1031)，社区同学 [YuLe](https://github.com/yuler) 的多次贡献，也还有很多同学提了很好的建议，谢谢大家的辛劳、贡献，这是一个彼此学习、共同成长的过程。也要额外感谢 BetterScroll 原作者[黄轶](https://github.com/ustbhuangyi)大佬的信任。

BetterScroll 2.0 目前经过了 20 多个 alpha 版本，已经发布了 beta 版本，但是却是已经稳定了的版本，内部和社区已经有了大量的下载使用，未来我们会持续做一些事情：

  1. 优化代码 & 包体积
  2. 提供更多的插件并且丰富示例 （欢迎 PR 或者提出你们的 ideas）
  3. 完善文档以及暴露更多的细节
  4. 测试完善

希望能有越来越多的人使用，同时也有更多的你参与进来，一起共建，让 BetterScroll 的整个生态变得 Better。
