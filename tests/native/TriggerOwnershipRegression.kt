package app.showcontrol.audio

fun main() {
  val mainChild = TriggerOrigin.MAIN_STACK.groupChild()
  val hitChild = TriggerOrigin.HIT.groupChild()
  check(mainChild.belongsToMainSequence && !mainChild.mayAutoFollowMainStack)
  check(!hitChild.belongsToMainSequence && !hitChild.mayAutoFollowMainStack)
  check(!survivesMainSelection(mainChild.belongsToMainSequence)) { "Previous must stop ordered group audio" }
  check(survivesMainSelection(hitChild.belongsToMainSequence)) { "Previous must preserve independent Hit groups" }
  check(TriggerOrigin.MAIN_STACK.mayAutoFollowMainStack)
  check(mainChild.groupChild() == mainChild && hitChild.groupChild() == hitChild)
  val eightVoices = List(4) { mainChild } + List(4) { hitChild }
  check(eightVoices.count { it.belongsToMainSequence } == 4)
  check(eightVoices.filter { survivesMainSelection(it.belongsToMainSequence) }.size == 4)
  check(eightVoices.none { it.mayAutoFollowMainStack }) { "Parallel children must never advance independently" }
  println("Trigger ownership: ordered group cancellation, independent Hit survival, eight voices and separate auto-follow passed")
}
