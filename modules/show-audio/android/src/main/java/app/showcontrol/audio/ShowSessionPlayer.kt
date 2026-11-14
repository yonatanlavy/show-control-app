package app.showcontrol.audio

import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/** Native semantic entrance and truthful readout. It renders no audio. */
@UnstableApi
internal class ShowSessionPlayer(
  looper: Looper,
  private val view: () -> SystemMediaView,
  private val metadata: () -> MediaMetadata,
  private val command: (String) -> Unit,
) : SimpleBasePlayer(looper) {
  fun refresh() = invalidateState()

  override fun getState(): State {
    val current = view()
    val commands = Player.Commands.Builder().addAll(
      Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_TIMELINE,
      Player.COMMAND_GET_METADATA, Player.COMMAND_GET_AUDIO_ATTRIBUTES,
    )
    if (current.canNavigate) commands.addAll(Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
    if (current.canGo) commands.addAll(Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
    if (current.canPauseResume) commands.add(Player.COMMAND_PLAY_PAUSE)
    if (current.canStop) commands.add(Player.COMMAND_STOP)
    val builder = State.Builder().setAvailableCommands(commands.build())
    if (!current.visible) return builder.build()
    val clip = current.clip
    val item = MediaItemData.Builder(clip?.identity ?: "show-control-state")
      .setMediaItem(MediaItem.Builder().setMediaId("show-control").setMediaMetadata(metadata()).build())
      .setIsSeekable(false)
    if (clip != null) item.setDurationUs(clip.durationMs * 1000)
    builder.setPlaylist(listOf(item.build())).setCurrentMediaItemIndex(0)
      .setPlaybackState(if (current.phase == SystemMediaPhase.WAITING) Player.STATE_BUFFERING else Player.STATE_READY)
      .setPlayWhenReady(current.playWhenReady, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackParameters(PlaybackParameters(clip?.rate ?: 1f, 1f))
      .setRepeatMode(if (clip?.loop == true) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF)
    // Never extrapolate an unknown main cursor merely because a Hit is audible.
    if (clip == null) builder.setContentPositionMs(PositionSupplier.ZERO)
    else builder.setContentPositionMs(clip.positionMs)
    return builder.build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    command(if (playWhenReady) "MEDIA_PLAY" else "MEDIA_PAUSE")
    return Futures.immediateVoidFuture()
  }

  override fun handleStop(): ListenableFuture<*> {
    command("MEDIA_STOP")
    return Futures.immediateVoidFuture()
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    // Even a one-item/last-item navigation reaches here with INDEX_UNSET. The
    // engine decides GO/final-song behavior; a system seek cannot mutate audio.
    when (seekCommand) {
      Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> command("MEDIA_NEXT")
      Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> command("MEDIA_PREVIOUS")
      else -> Unit // All position/media mutations are deliberately unavailable.
    }
    return Futures.immediateVoidFuture()
  }
}
