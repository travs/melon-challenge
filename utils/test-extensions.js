// any extensions to the testing framework we might need
function assertThrows (fn, args, msg) {
  /*
  Asserts that `fn(args)` will throw an `invalid JUMP` error.
  Errors with message `msg` otherwise.
  This is necessary since this error is not normally caught with Chai.
  */
  fn.apply(this, args)
    .then(function(){
      assert(false, msg);
    },
    function(error){
      assert.include(error.toString(), "invalid JUMP", msg);
    })
}

module.exports = {
  assertThrows
}
