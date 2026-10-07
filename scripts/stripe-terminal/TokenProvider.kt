package com.getcapacitor.community.stripe.terminal

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.core.util.Supplier
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import com.google.android.gms.common.util.BiConsumer
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.models.ConnectionTokenException

// SEZA_PATCH_SHARED_PENDING_CALLBACKS_V2
// No credential storage. Each one-shot callback has an ID and a deadline.
class TokenProvider(
    contextSupplier: Supplier<Context>,
    tokenProviderEndpoint: String,
    notifyListenersFunction: BiConsumer<String, JSObject>
) : ConnectionTokenProvider {
    init { bind(notifyListenersFunction) }

    override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
        val id: String
        synchronized(pending) {
            id = (++sequence).toString()
            pending[id] = callback
        }
        handler.postDelayed({
            val expired = synchronized(pending) { pending.remove(id) }
            expired?.onFailure(ConnectionTokenException("SEZA connection token request timed out"))
        }, 12_000)
        emit(id)
    }

    companion object {
        private val pending = linkedMapOf<String, ConnectionTokenCallback>()
        private var sequence = 0L
        var merchantEpoch = 0L
            private set
        private val handler = Handler(Looper.getMainLooper())
        private var notifier: BiConsumer<String, JSObject>? = null

        fun bind(current: BiConsumer<String, JSObject>) {
            notifier = current
            val ids = synchronized(pending) { pending.keys.toList() }
            ids.forEach { emit(it) }
        }

        private fun emit(id: String) {
            notifier?.accept(TerminalEnumEvent.RequestedConnectionToken.webEventName, JSObject().put("requestId", id))
        }

        fun setConnectionToken(call: PluginCall) {
            val requested = call.getString("requestId")
            val callback = synchronized(pending) {
                val id = requested ?: pending.keys.firstOrNull()
                if (id == null) null else pending.remove(id)
            }
            if (callback == null) {
                call.reject("Connection token callback is no longer pending", "TOKEN")
                return
            }
            val token = call.getString("token", "") ?: ""
            if (token.isEmpty()) {
                callback.onFailure(ConnectionTokenException("SEZA could not authorize the card reader"))
            } else {
                callback.onSuccess(token)
            }
            // Empty-token rejection has completed the SDK callback successfully.
            call.resolve()
        }

        fun notifyReaderEvent(epoch: Long, event: String, data: JSObject) {
            if (epoch == merchantEpoch) notifier?.accept(event, data)
        }

        fun rejectPending() {
            merchantEpoch++
            val callbacks = synchronized(pending) {
                val copy = pending.values.toList()
                pending.clear()
                copy
            }
            callbacks.forEach { it.onFailure(ConnectionTokenException("SEZA merchant session changed")) }
        }
    }
}
