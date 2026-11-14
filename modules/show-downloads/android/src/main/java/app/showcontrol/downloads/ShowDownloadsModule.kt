package app.showcontrol.downloads

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShowDownloadsModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext).applicationContext
  override fun definition() = ModuleDefinition {
    Name("ShowDownloads")
    Events("onIncludedLibraryProgress")
    AsyncFunction("includedLibraryInfo") { IncludedMusic.info(context()) }
    AsyncFunction("prepareIncludedLibrary") { id: String -> IncludedMusic.prepare(context(), id) { done, total -> sendEvent("onIncludedLibraryProgress", mapOf("id" to id, "completedBytes" to done, "totalBytes" to total)) } }
    Function("cancelIncludedLibrary") { id: String -> IncludedMusic.cancel(id) }
    AsyncFunction("releaseIncludedLibrary") { id: String -> IncludedMusic.release(context(), id) }
    AsyncFunction("search") { query: String, id: String -> DownloadRuntime.search(context(), query, id) }
    AsyncFunction("start") { json: String -> DownloadRuntime.start(context(), json) }
    AsyncFunction("getJobs") { DownloadRuntime.jobs(context()) }
    Function("cancel") { id: String -> DownloadRuntime.cancel(context(), id) }
    AsyncFunction("complete") { id: String -> DownloadRuntime.complete(context(), id) }
    AsyncFunction("remove") { id: String -> DownloadRuntime.remove(context(), id) }
  }
}
