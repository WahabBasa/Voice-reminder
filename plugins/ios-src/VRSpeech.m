#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VRSpeech, NSObject)

RCT_EXTERN_METHOD(status:(NSString *)localeId
                  engine:(NSString *)engine
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(prepare:(NSString *)localeId
                  engine:(NSString *)engine
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(transcribeFile:(NSString *)fileUri
                  localeId:(NSString *)localeId
                  engine:(NSString *)engine
                  requestId:(NSString *)requestId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel:(NSString *)requestId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// requiresMainQueueSetup lives on the Swift class — declaring it here too would
// collide with the primary class implementation.

@end
