#import "ShowControllerFlicBridge.h"

#if __has_include(<flic2lib/flic2lib.h>)
@import flic2lib;
#define SC_HAS_FLIC2 1
#else
#define SC_HAS_FLIC2 0
#endif

static NSString *const SCFlicErrorDomain = @"app.showcontrol.controller.flic2";

@interface ShowControllerFlicBridge ()
#if SC_HAS_FLIC2
<FLICManagerDelegate, FLICButtonDelegate>
#endif
@property(nonatomic, copy) SCFlicInputHandler inputHandler;
@property(nonatomic, copy) SCFlicStatusHandler statusHandler;
@property(nonatomic) BOOL configured;
@property(nonatomic) BOOL restored;
@property(nonatomic) BOOL backgroundRequested;
@property(nonatomic) NSInteger staleQueueMaxAgeMs;
@property(nonatomic) NSInteger staleEventsSuppressed;
@end

@implementation ShowControllerFlicBridge

- (instancetype)initWithInputHandler:(SCFlicInputHandler)inputHandler statusHandler:(SCFlicStatusHandler)statusHandler {
  self = [super init];
  if (self) {
    _inputHandler = [inputHandler copy];
    _statusHandler = [statusHandler copy];
    _staleQueueMaxAgeMs = 15000;
  }
  return self;
}

- (BOOL)sdkAvailable { return SC_HAS_FLIC2 == 1; }

- (void)configureWithBackground:(BOOL)background staleQueueMaxAgeMs:(NSInteger)staleQueueMaxAgeMs {
  self.backgroundRequested = background;
  self.staleQueueMaxAgeMs = MAX(0, MIN(staleQueueMaxAgeMs, 120000));
#if SC_HAS_FLIC2
  [FLICManager configureWithDelegate:self buttonDelegate:self background:background];
  self.configured = YES;
#else
  self.configured = NO;
#endif
  [self emitHealth];
}

- (void)start {
#if SC_HAS_FLIC2
  if (!self.configured) [self configureWithBackground:YES staleQueueMaxAgeMs:self.staleQueueMaxAgeMs];
  if (self.restored) {
    for (FLICButton *button in [FLICManager sharedManager].buttons) [button connect];
  }
#endif
  [self emitHealth];
}

- (void)stop {
#if SC_HAS_FLIC2
  if (self.restored) {
    for (FLICButton *button in [FLICManager sharedManager].buttons) [button disconnect];
  }
#endif
  [self emitHealth];
}

- (NSDictionary<NSString *, id> *)health {
  NSInteger paired = 0;
  NSInteger ready = 0;
  NSString *bluetooth = self.sdkAvailable ? @"unknown" : @"sdk_unavailable";
#if SC_HAS_FLIC2
  FLICManager *manager = [FLICManager sharedManager];
  if (manager) {
    switch (manager.state) {
      case FLICManagerStatePoweredOn: bluetooth = @"powered_on"; break;
      case FLICManagerStatePoweredOff: bluetooth = @"powered_off"; break;
      case FLICManagerStateUnauthorized: bluetooth = @"unauthorized"; break;
      case FLICManagerStateUnsupported: bluetooth = @"unsupported"; break;
      case FLICManagerStateResetting: bluetooth = @"resetting"; break;
      default: bluetooth = @"unknown"; break;
    }
    if (self.restored) {
      paired = manager.buttons.count;
      for (FLICButton *button in manager.buttons) if (button.isReady) ready += 1;
    }
  }
#endif
  NSString *detail = !self.sdkAvailable
    ? @"The official flic2lib XCFramework has not been supplied to this build."
    : (ready > 0 ? [NSString stringWithFormat:@"%ld Flic controller(s) ready.", (long)ready]
                 : @"No Flic controller is ready.");
  return @{
    @"sdkAvailable": @(self.sdkAvailable),
    @"configured": @(self.configured),
    @"restored": @(self.restored),
    @"bluetoothState": bluetooth,
    @"pairedCount": @(paired),
    @"readyCount": @(ready),
    @"connectingCount": @(MAX(0, paired - ready)),
    @"staleEventsSuppressed": @(self.staleEventsSuppressed),
    @"backgroundRequested": @(self.backgroundRequested),
    @"initialPairingMayRequireInternet": @YES,
    @"detail": detail,
  };
}

- (void)scanWithStatus:(SCFlicScanStatusHandler)status completion:(SCFlicScanCompletion)completion {
#if SC_HAS_FLIC2
  if (!self.restored) {
    completion(nil, [NSError errorWithDomain:SCFlicErrorDomain code:2 userInfo:@{
      NSLocalizedDescriptionKey: @"Flic state has not finished restoring; try pairing again shortly."
    }]);
    return;
  }
  status(@"scanning", @"Hold the Flic button for at least six seconds.");
  [[FLICManager sharedManager] scanForButtonsWithStateChangeHandler:^(FLICButtonScannerStatusEvent event) {
    status([NSString stringWithFormat:@"scanner_%ld", (long)event], @"Flic pairing is in progress.");
  } completion:^(FLICButton *button, NSError *error) {
    if (error || !button) {
      completion(nil, error ?: [NSError errorWithDomain:SCFlicErrorDomain code:3 userInfo:@{
        NSLocalizedDescriptionKey: @"Flic pairing ended without a button."
      }]);
      return;
    }
    button.delegate = self;
    [button connect];
    completion(@{
      @"deviceId": button.identifier.UUIDString,
      @"name": button.nickname ?: button.name ?: @"Flic 2",
      @"paired": @YES,
      @"initialPairingMayRequireInternet": @YES,
    }, nil);
  }];
#else
  completion(nil, [NSError errorWithDomain:SCFlicErrorDomain code:1 userInfo:@{
    NSLocalizedDescriptionKey: @"The official flic2lib XCFramework is missing from this build."
  }]);
#endif
}

- (void)cancelScan {
#if SC_HAS_FLIC2
  [[FLICManager sharedManager] stopScan];
#endif
}

- (void)emitHealth { self.statusHandler([self health]); }

#if SC_HAS_FLIC2
- (void)managerDidRestoreState:(FLICManager *)manager {
  self.restored = YES;
  for (FLICButton *button in manager.buttons) {
    button.delegate = self;
    [button connect];
  }
  [self emitHealth];
}

- (void)manager:(FLICManager *)manager didUpdateState:(FLICManagerState)state { [self emitHealth]; }
- (void)buttonDidConnect:(FLICButton *)button { [self emitHealth]; }
- (void)buttonIsReady:(FLICButton *)button { [self emitHealth]; }
- (void)button:(FLICButton *)button didDisconnectWithError:(NSError *)error {
  // Release local held-state only; a disconnect must never synthesize a command.
  self.inputHandler(button.identifier.UUIDString, @"primary", NO, NO, 0);
  [self emitHealth];
}
- (void)button:(FLICButton *)button didFailToConnectWithError:(NSError *)error { [self emitHealth]; }
- (void)button:(FLICButton *)button didUnpairWithError:(NSError *)error { [self emitHealth]; }

- (void)button:(FLICButton *)button didReceiveButtonDown:(BOOL)queued age:(NSInteger)age {
  NSInteger ageMs = queued ? MAX(0, age * 1000) : 0;
  if (queued && ageMs > self.staleQueueMaxAgeMs) {
    self.staleEventsSuppressed += 1;
    [self emitHealth];
    return;
  }
  self.inputHandler(button.identifier.UUIDString, @"primary", YES, queued, ageMs);
}

- (void)button:(FLICButton *)button didReceiveButtonUp:(BOOL)queued age:(NSInteger)age {
  NSInteger ageMs = queued ? MAX(0, age * 1000) : 0;
  if (queued && ageMs > self.staleQueueMaxAgeMs) {
    self.staleEventsSuppressed += 1;
    [self emitHealth];
    return;
  }
  self.inputHandler(button.identifier.UUIDString, @"primary", NO, queued, ageMs);
}
#endif

@end
