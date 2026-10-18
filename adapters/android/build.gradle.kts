// Keep AGP and Kotlin on the same root plugin classloader. Loading Kotlin here
// but AGP only in :app prevents KotlinAndroidTarget from seeing AGP BaseVariant.
plugins {
    id("com.android.application") version "8.9.2" apply false
    id("com.android.library") version "8.9.2" apply false
    kotlin("android") version "2.1.20" apply false
    kotlin("jvm") version "2.1.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.20" apply false
}
