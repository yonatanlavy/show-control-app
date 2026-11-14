const mockOptional = jest.fn()
jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockOptional() }))

function load() {
  let entry!: typeof import('../../modules/show-commerce').default
  jest.isolateModules(() => { entry = jest.requireActual<typeof import('../../modules/show-commerce')>('../../modules/show-commerce').default })
  return entry
}
beforeEach(() => mockOptional.mockReset())

it('contains optional native registration failure at import', () => {
  mockOptional.mockImplementationOnce(() => { throw new Error('Native registration failure') })
  const entry = load()
  expect(() => entry.product()).toThrow('ShowCommerce is unavailable')
})

it('keeps absent native commerce recoverable without preventing module loading', () => {
  mockOptional.mockReturnValue(null)
  const entry = load()
  expect(() => entry.restore()).toThrow('ShowCommerce is unavailable')
})

it('reports an old native delivery bridge explicitly instead of completing delivery locally', () => {
  mockOptional.mockReturnValue({})
  const entry = load()
  expect(() => entry.completeDelivery('ephemeral-delivery')).toThrow('updated native app')
})

it('forwards only an opaque delivery handle to native confirmation', async () => {
  const completeDelivery = jest.fn(async () => undefined)
  mockOptional.mockReturnValue({ completeDelivery })
  await expect(load().completeDelivery('ephemeral-delivery')).resolves.toBeUndefined()
  expect(completeDelivery).toHaveBeenCalledWith('ephemeral-delivery')
})
