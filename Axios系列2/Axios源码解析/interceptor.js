var chain = [dispatchRequest, undefined]
var promise = Promise.resolve(config)

Promise.resolve(config).then((config) => { return config }, (response) => {
  return response
})

