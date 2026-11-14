package app.showcontrol.visual

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

/** Disk reads, bounds validation and allocation run only on the image worker. */
internal object AudienceImageDecoder {
  fun decode(file: File): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 40_000_000) { "Image dimensions exceed the limit" }
    var sample = 1
    while (bounds.outWidth / sample > 1920 || bounds.outHeight / sample > 1920) sample *= 2
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply {
      inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888; inScaled = false
    }) ?: throw IllegalArgumentException("Image cannot be decoded")
  }
}
