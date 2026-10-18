package dev.ely.nativeprofile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class LayoutAndNoticeTest {
    @get:Rule val compose = createComposeRule()
    private fun text(id: String) = Node(id, "text", buildJsonObject { put("text", id) }, emptyList(), emptyList())
    private fun stack(direction: String, align: String) = Node("stack", "stack", buildJsonObject {
        put("direction", direction); put("align", align); put("gap", "sm")
    }, listOf(text("short"), text("long")), emptyList())

    @Test fun columnStretchAndAlignmentUseTheCrossAxis() {
        val alignment = mutableStateOf("stretch")
        compose.setContent {
            Box(Modifier.width(300.dp)) {
                NativeStack(stack("column", alignment.value)) { node ->
                    Text(node.id, modifier = Modifier.testTag(node.id))
                }
            }
        }
        compose.onNodeWithTag("short").assertWidthIsEqualTo(300.dp)
        compose.onNodeWithTag("long").assertWidthIsEqualTo(300.dp)
        for (align in listOf("start", "center", "end")) {
            compose.runOnIdle { alignment.value = align }
            val a = compose.onNodeWithTag("short").getUnclippedBoundsInRoot()
            val b = compose.onNodeWithTag("long").getUnclippedBoundsInRoot()
            assertTrue((a.right - a.left) < 300.dp)
            assertEquals(8.dp, b.top - a.bottom)
            when (align) {
                "start" -> assertEquals(a.left, b.left)
                "center" -> assertEquals(((a.left + a.right) / 2).value, ((b.left + b.right) / 2).value, 1f)
                "end" -> assertEquals(a.right, b.right)
            }
        }
    }

    @Test fun rowStretchUsesTallestChildWithoutEqualWidthColumns() {
        val alignment = mutableStateOf("stretch")
        compose.setContent {
            Box(Modifier.width(300.dp)) {
                NativeStack(stack("row", alignment.value)) { node ->
                    // Min heights permit stretch; different natural widths expose forced weights.
                    Box(Modifier.width(if (node.id == "short") 40.dp else 100.dp)
                        .heightIn(min = if (node.id == "short") 20.dp else 40.dp).testTag(node.id))
                }
            }
        }
        compose.onNodeWithTag("short").assertWidthIsEqualTo(40.dp).assertHeightIsEqualTo(40.dp)
        compose.onNodeWithTag("long").assertWidthIsEqualTo(100.dp).assertHeightIsEqualTo(40.dp)
        val a = compose.onNodeWithTag("short").getUnclippedBoundsInRoot()
        val b = compose.onNodeWithTag("long").getUnclippedBoundsInRoot()
        assertEquals(8.dp, b.left - a.right)
        for (align in listOf("start", "center", "end")) {
            compose.runOnIdle { alignment.value = align }
            compose.onNodeWithTag("short").assertHeightIsEqualTo(20.dp)
            val first = compose.onNodeWithTag("short").getUnclippedBoundsInRoot()
            val second = compose.onNodeWithTag("long").getUnclippedBoundsInRoot()
            when (align) {
                "start" -> assertEquals(first.top, second.top)
                "center" -> assertEquals(((first.top + first.bottom) / 2).value, ((second.top + second.bottom) / 2).value, 1f)
                "end" -> assertEquals(first.bottom, second.bottom)
            }
        }
    }

    @Test fun nestedConstrainedRowStretchesAtLargeFontScaleAndMirrorsRTL() {
        val direction = mutableStateOf(LayoutDirection.Ltr)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalLayoutDirection provides direction.value,
                LocalDensity provides Density(density.density, fontScale = 1.8f)) {
                Box(Modifier.width(180.dp)) {
                    NativeStack(stack("row", "stretch")) { node ->
                        if (node.id == "short") {
                            NativeStack(stack("column", "stretch").copy(id = "nested")) { item ->
                                Text(item.id, modifier = Modifier.testTag("nested-${item.id}"))
                            }
                        } else Text("Tall\nside\ntext", modifier = Modifier.testTag("side"))
                    }
                }
            }
        }
        // Native controls and nested columns can consume available row width.
        // This constrained case must remain finite; it is not a CSS flexbox claim.
        for (layoutDirection in listOf(LayoutDirection.Ltr, LayoutDirection.Rtl)) {
            compose.runOnIdle { direction.value = layoutDirection }
            val nested = compose.onNodeWithTag("nested").getUnclippedBoundsInRoot()
            val side = compose.onNodeWithTag("side").getUnclippedBoundsInRoot()
            assertTrue((nested.right - nested.left).value.isFinite() && (nested.bottom - nested.top).value.isFinite())
            assertTrue((side.right - side.left).value.isFinite() && (side.bottom - side.top).value.isFinite())
            assertTrue((nested.right - nested.left) > 0.dp)
            assertTrue((side.right - side.left) > 0.dp)
            assertEquals((nested.bottom - nested.top).value, (side.bottom - side.top).value, 1f)
            if (layoutDirection == LayoutDirection.Ltr) assertTrue(nested.left <= side.left)
            else assertTrue(nested.right >= side.right)
        }
    }

    @Test fun noticeCombinesTitleAndTextWithLivePriorityAcrossReplacement() {
        val ready = InstrumentationRegistry.getInstrumentation().context.assets.open("profile-ready.json")
            .use { ProfileProtocol.decode(it.readBytes()) }
        fun screen(urgent: Boolean, text: String): ProfileState {
            val notice = Node("custom-notice", "notice", buildJsonObject {
                put("title", "Update"); put("text", text); put("urgent", urgent)
            }, emptyList(), emptyList())
            val envelope = ready.copy(region = ready.region.copy(children = listOf(notice) + ready.region.children))
            return ProfileState().beginLoad(ready.requestID).acceptLoad(envelope)
        }
        val state = mutableStateOf(screen(false, "Review details."))
        compose.setContent { MaterialTheme { ProfileScreen(state.value, { _, _ -> }, {}, {}, {}) } }
        compose.onNodeWithTag("custom-notice")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
            .assertTextContains("Update").assertTextContains("Review details.")
        compose.runOnIdle { state.value = screen(true, "Action needed.") }
        compose.onNodeWithTag("custom-notice")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Assertive))
            .assertTextContains("Update").assertTextContains("Action needed.")
    }
}
