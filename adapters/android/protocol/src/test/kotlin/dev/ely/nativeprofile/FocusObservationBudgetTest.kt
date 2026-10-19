package dev.ely.nativeprofile

import java.util.concurrent.CancellationException
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeoutException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame
import kotlin.test.assertTrue

class FocusObservationBudgetTest {
    @Test fun innerBudgetExhaustionIsReadinessFailureWithOriginalCause() {
        val cause = FocusObservationBudgetExceeded("after posting main-thread probe")
        val sample = FutureTask<Boolean> { throw cause }.apply { run() }
        val failure = assertFailsWith<AssertionError> { awaitFocusObservation(sample, 350, 350) }
        assertSame(cause, failure.cause)
        assertTrue(failure.message.orEmpty().contains("Window focus observation exceeded 350ms"))
        assertTrue(failure.message.orEmpty().contains("after posting main-thread probe"))
    }

    @Test fun zeroBudgetBeforePostingIsDistinctFromAnUnansweredPostedProbe() {
        val before = assertFailsWith<FocusObservationBudgetExceeded> {
            requireFocusObservationBudget(0, "before posting main-thread probe")
        }
        assertEquals("before posting main-thread probe", before.phase)
        requireFocusObservationBudget(1, "before posting main-thread probe")
    }

    @Test fun outerDeadlineIsReadinessFailureAndRetainsTimeoutCause() {
        val sample = FutureTask { true } // Never started: get(0) deterministically times out.
        val failure = assertFailsWith<AssertionError> { awaitFocusObservation(sample, 0, 350) }
        assertTrue(failure.cause is TimeoutException)
        assertEquals("Window focus observation exceeded 350ms", failure.message)
    }

    @Test fun unrelatedWorkerFailureRemainsExecutionFailure() {
        val cause = IllegalStateException("Main thread did not answer the focus probe")
        val sample = FutureTask<Boolean> { throw cause }.apply { run() }
        assertSame(cause, assertFailsWith<ExecutionException> { awaitFocusObservation(sample, 350, 350) }.cause)
    }

    @Test fun nestedTimeoutIsNotMistakenForTheOuterDeadline() {
        val cause = TimeoutException("unrelated operation")
        val sample = FutureTask<Boolean> { throw cause }.apply { run() }
        assertSame(cause, assertFailsWith<ExecutionException> { awaitFocusObservation(sample, 350, 350) }.cause)
    }

    @Test fun cancelledObservationRemainsCancelled() {
        val sample = FutureTask { true }.apply { cancel(false) }
        assertFailsWith<CancellationException> { awaitFocusObservation(sample, 350, 350) }
    }

    @Test fun interruptedObservationRemainsInterrupted() {
        val sample = FutureTask { true }
        Thread.currentThread().interrupt()
        try {
            assertFailsWith<InterruptedException> { awaitFocusObservation(sample, 350, 350) }
        } finally { Thread.interrupted() }
    }

    @Test fun successfulObservationRetainsItsValue() {
        val value = false to "observed ANR"
        val sample = FutureTask { value }.apply { run() }
        assertSame(value, awaitFocusObservation(sample, 350, 350))
    }
}
