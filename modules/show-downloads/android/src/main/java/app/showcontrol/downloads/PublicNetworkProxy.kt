package app.showcontrol.downloads

import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** Loopback-only HTTPS tunnel. Extractor redirects cannot reach private services. */
internal class PublicNetworkProxy : AutoCloseable {
  private val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
  private val sockets = ConcurrentHashMap.newKeySet<Socket>()
  private val workers = Executors.newFixedThreadPool(16)
  val port: Int get() = server.localPort
  init {
    Thread({
      while (!server.isClosed) {
        val socket = runCatching { server.accept() }.getOrNull() ?: break
        if (sockets.size >= 24) { socket.close(); continue }
        sockets.add(socket)
        runCatching { workers.execute { tunnel(socket) } }.onFailure { sockets.remove(socket); socket.close() }
      }
    }, "showcontrol-public-proxy").apply { isDaemon = true; start() }
  }
  private fun tunnel(client: Socket) {
    var remote: Socket? = null
    try {
      client.soTimeout = 20_000
      val input = client.getInputStream(); val header = StringBuilder()
      while (!header.endsWith("\r\n\r\n")) { val next = input.read(); require(next >= 0 && header.length < 8192); header.append(next.toChar()) }
      val first = header.toString().substringBefore("\r\n").split(' ')
      require(first.size == 3 && first[0] == "CONNECT")
      val target = first[1]; require(target.endsWith(":443")); val host = target.removeSuffix(":443").removeSurrounding("[", "]")
      val addresses = InetAddress.getAllByName(host)
      require(addresses.isNotEmpty() && addresses.none { it.isAnyLocalAddress || it.isLoopbackAddress || it.isLinkLocalAddress || it.isSiteLocalAddress || it.isMulticastAddress || it.hostAddress?.startsWith("fc") == true || it.hostAddress?.startsWith("fd") == true })
      for (address in addresses) {
        val candidate = Socket()
        try { candidate.connect(java.net.InetSocketAddress(address, 443), 5000); remote = candidate; break } catch (_: Exception) { candidate.close() }
      }
      val connected = remote ?: throw IllegalStateException("No public address available")
      sockets.add(connected); connected.soTimeout = 20_000
      client.getOutputStream().write("HTTP/1.1 200 Connection Established\r\n\r\n".toByteArray())
      val upstream = connected
      val outbound = Thread({ runCatching { input.copyTo(upstream.getOutputStream(), 65536); upstream.shutdownOutput() } }, "showcontrol-proxy-out").apply { isDaemon = true; start() }
      upstream.getInputStream().copyTo(client.getOutputStream(), 65536); client.shutdownOutput(); outbound.join(2000)
    } catch (_: Exception) { runCatching { client.getOutputStream().write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n".toByteArray()) } }
    finally { remote?.let { sockets.remove(it); runCatching { it.close() } }; sockets.remove(client); runCatching { client.close() } }
  }
  override fun close() { server.close(); sockets.forEach { runCatching { it.close() } }; sockets.clear(); workers.shutdownNow() }
}
