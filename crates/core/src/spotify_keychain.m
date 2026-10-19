#import <Foundation/Foundation.h>
#import <Security/Security.h>

// OAuth refresh tokens belong in the login Keychain, never .env or web storage.
static NSDictionary *rs_token_query(const char *account) {
    return @{(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
             (__bridge id)kSecAttrService: @"com.soundssource.rust-sound.spotify",
             (__bridge id)kSecAttrAccount: [NSString stringWithUTF8String:account]};
}

int rs_spotify_token_load(const char *account, char *buffer, unsigned capacity) {
    @autoreleasepool {
        NSMutableDictionary *query = [rs_token_query(account) mutableCopy];
        query[(__bridge id)kSecReturnData] = @YES;
        CFTypeRef result = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
        if (status == errSecItemNotFound) return 0;
        if (status != errSecSuccess) return status;
        NSData *data = CFBridgingRelease(result);
        if (data.length >= capacity) return errSecParam;
        memcpy(buffer, data.bytes, data.length);
        return (int)data.length;
    }
}

int rs_spotify_token_save(const char *account, const char *token) {
    @autoreleasepool {
        NSDictionary *query = rs_token_query(account);
        NSData *data = [[NSString stringWithUTF8String:token] dataUsingEncoding:NSUTF8StringEncoding];

        NSMutableDictionary *item = [query mutableCopy];
        item[(__bridge id)kSecValueData] = data;

        // Allow all builds of the application (including ad-hoc dev recompiles) to access without prompting
        SecAccessRef access = NULL;
        if (SecAccessCreate((__bridge CFStringRef)@"SoundsSource Studio", NULL, &access) == errSecSuccess && access) {
            item[(__bridge id)kSecAttrAccess] = (__bridge id)access;
            CFRelease(access);
        }

        // Delete previous item first so the open access control takes effect
        SecItemDelete((__bridge CFDictionaryRef)query);
        return SecItemAdd((__bridge CFDictionaryRef)item, NULL);
    }
}

int rs_spotify_token_delete(const char *account) {
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)rs_token_query(account));
    return status == errSecItemNotFound ? errSecSuccess : status;
}
