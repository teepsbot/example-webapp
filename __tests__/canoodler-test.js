jest.dontMock('../scripts/canoodler')
var doodleify = require('../scripts/canoodler').doodleify

describe('doodleify', () => {
  it('Doodles a person', () => {
    var doodledPerson = doodleify('steven')
    expect(doodledPerson).toBe('steven is totally doodles')
  })
})
