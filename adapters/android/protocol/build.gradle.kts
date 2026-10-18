plugins { kotlin("jvm") }
kotlin { jvmToolchain(21) }
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    testImplementation(kotlin("test-junit"))
}
tasks.test {
    systemProperty("ely.fixtures", rootProject.file("../../contracts/native/profile-v1/fixtures").absolutePath)
    inputs.dir(rootProject.file("../../contracts/native/profile-v1/fixtures"))
    inputs.property("controlsServer", providers.environmentVariable("ELY_NATIVE_CONTROLS_BASE_URL").orElse(""))
    inputs.property("liveServer", providers.environmentVariable("ELY_NATIVE_TEST_BASE_URL").orElse(""))
}

// Shared only with Android instrumentation tests, never shipped in the app.
kotlin.sourceSets.named("test") { kotlin.srcDir("../test-support") }
