package dev.ely.nativeprofile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp

@Stable
private class InputControl(initial: String) {
    var value by mutableStateOf(TextFieldValue(initial))
    var focused = false
    val focusRequester = FocusRequester()
}

/** Native controls only. No WebView, browser interpreter, or remote executable content. */
@Composable
fun ProfileScreen(
    state: ProfileState,
    onEdit: (String, String) -> Unit,
    onSave: () -> Unit,
    onRetry: () -> Unit,
    onReload: () -> Unit,
    serverEndpoint: String? = null,
) {
    val controls = remember { mutableStateMapOf<String, InputControl>() }
    val composing = controls.values.any { it.value.composition != null }
    var showReloadConfirmation by remember { mutableStateOf(false) }
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("elysdui Native Profile", style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() })
            if (state.loadingID != null) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Loading profile" })
            }
            state.hardError?.let { detail ->
                Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Profile unavailable", style = MaterialTheme.typography.titleMedium)
                        Text(detail, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
                        if (state.screen != null) Text("Your draft is still on this device. Reloading discards it.")
                    }
                }
            }
            state.screen?.let { screen ->
                RenderNode(screen.region, state, controls, state.canSave && !composing, onEdit) {
                    if (controls.values.none { it.value.composition != null }) onSave()
                }
            }
            if (state.message.isNotEmpty()) {
                Text(state.message, modifier = Modifier.testTag("request-status").semantics { liveRegion = LiveRegionMode.Polite })
            }
            state.retryMessage?.let {
                Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                Button(onClick = { if (controls.values.none { it.value.composition != null }) onRetry() }, enabled = state.pending?.inFlight == false && !composing,
                    modifier = Modifier.testTag("retry-save")) { Text("Retry save") }
            }
            if (composing) Text("Finish composing text before saving.", style = MaterialTheme.typography.bodySmall)
            TextButton(
                onClick = { if (state.screen == null) onReload() else showReloadConfirmation = true },
                enabled = state.loadingID == null && state.pending?.inFlight != true,
                modifier = Modifier.testTag("reload-profile"),
            ) { Text(if (state.screen == null) "Load profile" else "Reload profile…") }
            serverEndpoint?.let { Text("Demo server: $it", style = MaterialTheme.typography.bodySmall) }
        }
    }
    if (showReloadConfirmation) {
        AlertDialog(
            onDismissRequest = { showReloadConfirmation = false },
            title = { Text("Reload profile?") },
            text = { Text("This discards your local draft and loads the current server profile. A save with an unknown result may already have succeeded.") },
            confirmButton = { TextButton(onClick = { showReloadConfirmation = false; controls.clear(); onReload() }) { Text("Discard draft and reload") } },
            dismissButton = { TextButton(onClick = { showReloadConfirmation = false }) { Text("Keep editing") } },
        )
    }
}

@Composable
private fun RenderNode(
    node: Node,
    state: ProfileState,
    controls: MutableMap<String, InputControl>,
    canSubmit: Boolean,
    onEdit: (String, String) -> Unit,
    onSave: () -> Unit,
) {
    key(node.id) {
        val child: @Composable (Node) -> Unit = { RenderNode(it, state, controls, canSubmit, onEdit, onSave) }
        when (node.type) {
            "region", "form" -> Column(Modifier.fillMaxWidth().testTag(node.id), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                val label = node.string("label")
                if (label.isNotEmpty()) Text(label, style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { heading() })
                node.children.forEach { child(it) }
            }
            "stack" -> NativeStack(node, child)
            "text" -> Text(node.string("text"), modifier = Modifier.testTag(node.id))
            "notice" -> Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium) {
                Column(Modifier.fillMaxWidth().padding(16.dp).testTag(node.id).semantics(mergeDescendants = true) {
                    liveRegion = if (node.boolean("urgent")) LiveRegionMode.Assertive else LiveRegionMode.Polite
                }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (node.string("title").isNotEmpty()) Text(node.string("title"), style = MaterialTheme.typography.titleMedium)
                    Text(node.string("text"))
                }
            }
            "input" -> {
                val field = node.string("name")
                val draft = state.drafts[field].orEmpty()
                val control = controls.getOrPut(node.id) { InputControl(draft) }
                val errorText = state.errors[field]
                // Keep TextFieldValue (including selection/composition) outside the replaced tree.
                // Server canonicalization is adopted only after the reducer accepts its edit revision.
                LaunchedEffect(draft, control.value.composition) {
                    if (control.value.text != draft && control.value.composition == null) {
                        val selection = control.value.selection
                        control.value = TextFieldValue(draft, TextRange(selection.start.coerceAtMost(draft.length), selection.end.coerceAtMost(draft.length)))
                    }
                }
                LaunchedEffect(node.id) { if (control.focused) control.focusRequester.requestFocus() }
                OutlinedTextField(
                    value = control.value,
                    onValueChange = { value -> control.value = value; onEdit(field, value.text) },
                    label = { Text(node.string("label") + if (node.boolean("required")) " (required)" else "") },
                    placeholder = { Text(node.string("placeholder")) },
                    enabled = !node.boolean("disabled") && state.loadingID == null,
                    readOnly = node.boolean("readonly"),
                    singleLine = true,
                    isError = errorText != null,
                    supportingText = if (errorText == null) null else ({ Text(errorText) }),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { if (canSubmit && control.value.composition == null) onSave() }),
                    modifier = Modifier.fillMaxWidth().testTag(node.id).focusRequester(control.focusRequester)
                        .onFocusChanged { control.focused = it.isFocused }
                        .semantics { if (errorText != null) error(errorText) },
                )
            }
            "switch", "checkbox" -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val name = node.string("name")
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(node.string("label"), modifier = Modifier.weight(1f))
                    val controlModifier = Modifier.testTag(node.id).semantics { contentDescription = node.string("label") }
                    if (node.type == "checkbox") Checkbox(checked = state.drafts[name] == "true", onCheckedChange = { onEdit(name, it.toString()) },
                        enabled = !node.boolean("disabled") && state.loadingID == null, modifier = controlModifier)
                    else Switch(checked = state.drafts[name] == "true", onCheckedChange = { onEdit(name, it.toString()) },
                        enabled = !node.boolean("disabled") && state.loadingID == null,
                        modifier = Modifier.testTag(node.id).semantics { contentDescription = node.string("label") })
                }
                state.errors[name]?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { error(it) }) }
            }
            "select" -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val name = node.string("name")
                val options = node.options()
                val enabled = !node.boolean("disabled") && state.loadingID == null
                var expanded by remember(node.id, options) { mutableStateOf(false) }
                LaunchedEffect(enabled) { if (!enabled) expanded = false }
                Text(node.string("label"))
                Box {
                    OutlinedButton(onClick = { expanded = true }, enabled = enabled,
                        modifier = Modifier.testTag(node.id).semantics { contentDescription = node.string("label") }) {
                        Text(options.firstOrNull { it.value == state.drafts[name] }?.label.orEmpty())
                    }
                    DropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
                        options.forEach { option ->
                            DropdownMenuItem(text = { Text(option.label) }, onClick = {
                                expanded = false
                                onEdit(name, option.value)
                            }, modifier = Modifier.testTag("${node.id}-option-${option.value}").semantics {
                                selected = option.value == state.drafts[name]
                            })
                        }
                    }
                }
                state.errors[name]?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { error(it) }) }
            }
            "button" -> NativeSubmitButton(node, state.pending?.inFlight == true, canSubmit, onSave)
            else -> Text("This component is not supported.", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun NativeSubmitButton(node: Node, busy: Boolean, canSubmit: Boolean, onSave: () -> Unit) {
    val modifier = Modifier.testTag(node.id).semantics { if (busy) stateDescription = "Saving" }
    val enabled = canSubmit && !node.boolean("disabled")
    val padding = when (node.string("size", "default")) {
        "xs" -> PaddingValues(horizontal = 8.dp, vertical = 4.dp)
        "sm" -> PaddingValues(horizontal = 12.dp, vertical = 6.dp)
        "lg" -> PaddingValues(horizontal = 24.dp, vertical = 16.dp)
        else -> ButtonDefaults.ContentPadding
    }
    val content: @Composable RowScope.() -> Unit = {
        if (busy) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(if (busy) "Saving…" else node.string("label"))
    }
    when (node.string("variant", "default")) {
        "outline" -> OutlinedButton(onClick = onSave, modifier = modifier, enabled = enabled, contentPadding = padding, content = content)
        "ghost" -> TextButton(onClick = onSave, modifier = modifier, enabled = enabled, contentPadding = padding, content = content)
        "secondary" -> FilledTonalButton(onClick = onSave, modifier = modifier, enabled = enabled, contentPadding = padding, content = content)
        "destructive" -> Button(onClick = onSave, modifier = modifier, enabled = enabled, contentPadding = padding,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error), content = content)
        else -> Button(onClick = onSave, modifier = modifier, enabled = enabled, contentPadding = padding, content = content)
    }
}

/** Stretch affects only the cross axis; row children are not equal-width columns. */
@Composable
fun NativeStack(node: Node, child: @Composable (Node) -> Unit) {
    val gap = when (node.string("gap", "md")) { "none" -> 0.dp; "xs" -> 4.dp; "sm" -> 8.dp; "lg" -> 24.dp; else -> 16.dp }
    val align = node.string("align", "stretch")
    if (node.string("direction", "column") == "row") {
        val modifier = Modifier.fillMaxWidth().testTag(node.id)
        Row(if (align == "stretch") modifier.height(IntrinsicSize.Min) else modifier,
            horizontalArrangement = Arrangement.spacedBy(gap),
            verticalAlignment = when (align) { "center" -> Alignment.CenterVertically; "end" -> Alignment.Bottom; else -> Alignment.Top }) {
            node.children.forEach { nested ->
                key(nested.id) {
                    Box((if (align == "stretch") Modifier.fillMaxHeight() else Modifier).width(IntrinsicSize.Max),
                        propagateMinConstraints = true) { child(nested) }
                }
            }
        }
    } else {
        Column(Modifier.fillMaxWidth().testTag(node.id), verticalArrangement = Arrangement.spacedBy(gap),
            horizontalAlignment = when (align) { "center" -> Alignment.CenterHorizontally; "end" -> Alignment.End; else -> Alignment.Start }) {
            node.children.forEach { nested ->
                key(nested.id) {
                    Box(if (align == "stretch") Modifier.fillMaxWidth() else Modifier,
                        propagateMinConstraints = true) { child(nested) }
                }
            }
        }
    }
}
