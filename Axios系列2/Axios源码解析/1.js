var array = [1, 1, '1', '1', null, null]
let unique_1 = arr => [...new Set(arr)]

function unquie_2(array) {
  return array.filter(function(item, index, array) {
    return array.indexOf(item) === index
  })
}

function forEach(fn) {
  utils.forEach
  this.handlers.forEach(item => {
    fn(item)
  })
}
