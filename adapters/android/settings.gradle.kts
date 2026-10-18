pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "ElyNativeProfile"
include(":protocol")
if (!providers.gradleProperty("protocolOnly").isPresent) include(":renderer", ":app")
