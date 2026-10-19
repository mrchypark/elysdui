package dev.ely.nativeprofile

import java.util.concurrent.ExecutionException
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/** Test-only sentinel: a shared observation deadline expired, not evidence of an ANR. */
internal class FocusObservationBudgetExceeded(val phase: String) :
    Exception("Window focus observation budget exhausted: $phase")

internal fun requireFocusObservationBudget(remainingMillis: Long, phase: String) {
    if (remainingMillis <= 0) throw FocusObservationBudgetExceeded(phase)
}

/** Only the known inner deadline and Future's outer deadline share this failure category. */
internal fun <T> awaitFocusObservation(sample: Future<T>, remainingMillis: Long, timeoutMillis: Long): T =
    try {
        sample.get(remainingMillis, TimeUnit.MILLISECONDS)
    } catch (timeout: TimeoutException) {
        throw AssertionError("Window focus observation exceeded ${timeoutMillis}ms", timeout)
    } catch (failure: ExecutionException) {
        val cause = failure.cause
        if (cause is FocusObservationBudgetExceeded) {
            throw AssertionError("Window focus observation exceeded ${timeoutMillis}ms: ${cause.phase}", cause)
        }
        throw failure
    }
