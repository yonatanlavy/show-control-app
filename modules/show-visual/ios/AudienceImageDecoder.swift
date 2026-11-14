import Foundation
import ImageIO

enum AudienceImageDecoder {
  private enum DecodeError: Error { case invalidImage }
  static func decode(_ url: URL) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
          let width = (properties[kCGImagePropertyPixelWidth as String] as? NSNumber)?.int64Value,
          let height = (properties[kCGImagePropertyPixelHeight as String] as? NSNumber)?.int64Value,
          width > 0, height > 0, width <= 40_000_000, height <= 40_000_000,
          width <= 40_000_000 / height,
          let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: 1920,
            kCGImageSourceCreateThumbnailWithTransform: true,
          ] as CFDictionary) else { throw DecodeError.invalidImage }
    return thumbnail
  }
}
