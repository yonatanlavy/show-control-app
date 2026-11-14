#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^SCFlicInputHandler)(NSString *deviceId, NSString *inputKey, BOOL down, BOOL queued, NSInteger ageMs);
typedef void (^SCFlicStatusHandler)(NSDictionary<NSString *, id> *status);
typedef void (^SCFlicScanStatusHandler)(NSString *state, NSString *detail);
typedef void (^SCFlicScanCompletion)(NSDictionary<NSString *, id> * _Nullable result, NSError * _Nullable error);

@interface ShowControllerFlicBridge : NSObject

@property(nonatomic, readonly) BOOL sdkAvailable;

- (instancetype)initWithInputHandler:(SCFlicInputHandler)inputHandler
                       statusHandler:(SCFlicStatusHandler)statusHandler;
- (void)configureWithBackground:(BOOL)background staleQueueMaxAgeMs:(NSInteger)staleQueueMaxAgeMs;
- (void)start;
- (void)stop;
- (NSDictionary<NSString *, id> *)health;
- (void)scanWithStatus:(SCFlicScanStatusHandler)status completion:(SCFlicScanCompletion)completion;
- (void)cancelScan;

@end

NS_ASSUME_NONNULL_END
