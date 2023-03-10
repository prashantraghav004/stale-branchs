import * as timeFuncs from '../../src/functions/utils/get-time'

describe('Get Time Functions', () => {
  let startDate = new Date('2022-01-24T01:45:30.000Z').getTime()
  let endDate = new Date('2022-01-22T01:45:30.000Z').getTime()

  test('Get Days', async () => {
    let result = timeFuncs.getDays(startDate, endDate)
    expect(result).toBe(2)
  })

  test('Get Minutes', async () => {
    let result = timeFuncs.getMinutes(startDate, endDate)
    expect(result).toBe(2880)
  })
  /* 
  test('Get Hours', async () => {
    let result = timeFuncs.getHours(startDate, endDate)
    expect(result).toBe(48)
  })
  test('Get Seconds', async () => {
    let result = timeFuncs.getnSeconds(startDate, endDate)
    expect(result).toBe(172800)
  })*/
})
