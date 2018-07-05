import globalConfig from './config';
import {
    BaseSubscriptionContext,
    getCurrentContext,
} from './watch';

interface SubscriptionManagerConfig<T, Q = void> {
    /**
     * Synchronously get the "current" value for something with a given query
     * param. This get may happen before the subscription call is made and
     * should handle scenarios where data is unknown or missing gracefully.
     * @param query - The query for a given response
     * @return - The response for a given query.
     */
    get(query: Q): T;

    /**
     * Callback for when we want to subscribe to a given set of queries. This
     * is called on a subsequent event loop after a get to batch multiple
     * queries and to play nice with React.
     * @param queries - List of queries to subscribe to.
     */
    subscribe(queries: Q[]): void;

    /**
     * Callback for when a set of queries no longer need subscribing to.
     * @param query - The query for a given response
     */
    unsubscribe(queries: Q[]): void;

    /**
     * Optional helper to convert query to key for string. By default, this
     * returns the query itself if it a string or checks for the presence for
     * key or `toString` method.
     * @param query - The query for a given response
     * @return - Unique stringified form for a query.
     */
    queryToString?: (query: Q) => string;

    /**
     * Optional function to control debouncing / deferral of subscription
     * updates after a get. Defaults to requestAnimationFrame.
     */
    updateSubscription?: (cb: () => void) => void;
}

/**
 * Default query conversion function.
 * @param q - Query object
 */
function defaultQueryToString(q: any): string {
    if (typeof q === 'string') return q;
    if (typeof q === 'undefined') return ''; // Normalize undefined query as empty stinrg
    if (!q) throw new Error('Unable to convert falsey query to string');
    if (typeof q.key === 'string') return q.key;
    if (q.hasOwnProperty('toString')) return q.toString();
    throw new Error('Unable to convert query to string');
}

/**
 * Incrementing index to use for SubscriptionManager IDs.
 */
let idCount = 0;
function getId() {
    idCount += 1;
    return String(idCount);
}

/**
 * A SubscriptionManager manages both synchronous queries for some data
 * object and requests to subscribe / unsubscribe to that query.
 */
export default class SubscriptionManager<T, Q = void> {
    constructor(protected config: SubscriptionManagerConfig<T, Q>) {
        this.reset = this.reset.bind(this);
        this.updateSubscriptions = this.updateSubscriptions.bind(this);
    }

    /**
     * Unique ID used by SubscriptionContext to index multiple Managers.
     */
    protected id = getId();

    /**
     * Map from context ID to a map of watched queries. Watched queries are
     * not necessarily subscribed queries yet.
     */
    protected watchedQueryKeysByContextId: Record<string, Record<string, Q>> = {};

    /** Map from context ID to instances */
    protected watchedContexts: Record<string, BaseSubscriptionContext<any>> = {};

    /** Map of stringified query keys currently subscribed to */
    protected subscribedQueryKeys: Record<string, Q> = {};

    /** Guards against concurrent pending subscription updates */
    protected pendingSubscriptionUpdate = false;

    /**
     * Synchronously gets the value for a given query. No guarantee that value
     * exists.
     * @param query - Query for a given value
     * @param context - Optional subscription context to register with.
     * @return The queried value
     */
    get(query: Q, context?: BaseSubscriptionContext<any>): T {
        const ret = this.config.get(query);

        // This intentionally happens after `config.get` because we shouldn't
        // subscribe if get throws.
        const currentContext = this.getContext('get', context);
        if (currentContext) {
            this.registerQuery(currentContext, query);
            this.scheduleSubscriptionUpdate();
        }

        return ret;
    }

    queryToString(query: Q) {
        const { queryToString } = this.config;
        const key = (queryToString || defaultQueryToString)(query);
        return key;
    }

    /**
     * Helper to verify the current subscription context. May errors if config
     * is set that way.
     * @param name - Name of mehtod invoking this
     * @param context - Optional existing context to use
     * @return The active context or null.
     */
    protected getContext(name: string, context?: BaseSubscriptionContext<any>) {
        const currentContext = context || getCurrentContext();
        if (!currentContext && globalConfig.noGetOutsideContext) {
            throw new Error(`Called '${name}' outside a valid subscription context`);
        }
        return currentContext;
    }

    /**
     * Helper to register that a given subscription context is watching some
     * query
     * @param context A subscription context
     * @param query Query being watched
     */
    protected registerQuery(context: BaseSubscriptionContext<any>, query: Q) {
        const id = context.id;
        const key = this.queryToString(query);
        let queryKeys = this.watchedQueryKeysByContextId[id];
        if (!queryKeys) {
            queryKeys = this.watchedQueryKeysByContextId[id] = {};
        }

        // No query keys implies we haven't registered out reset yet
        // Note that this.reset is bound in constructor.
        if (!Object.keys(queryKeys).length) {
            context.registerReset(this.reset);
        }

        this.watchedQueryKeysByContextId[id][key] = query;
        this.watchedContexts[id] = context;
    }

    /**
     * Reset callback registered with subscription context. Used to
     * unwatch subscriptions on update or unmount.
     * @param context Context to reset for
     */
    protected reset(context: BaseSubscriptionContext<any>) {
        const id = context.id;
        delete this.watchedQueryKeysByContextId[id];
        delete this.watchedContexts[id];
        this.scheduleSubscriptionUpdate();
    }

    /**
     * Reconcile watched queries with active subscriptions
     */
    protected updateSubscriptions() {
        // Clear scheduled update first so we don't block anything on error
        this.pendingSubscriptionUpdate = false;

        // Queries + keys we'll be unsubscribing from
        const toUnsubscribe: Record<string, Q> = {};
        // Queries + keys we'll be subscribing to
        const toSubscribe: Record<string, Q> = {};
        // Map of query keys with context components watching them
        const keysBeingWatched: Record<string, Q> = {};

        Object.keys(this.watchedQueryKeysByContextId).forEach((contextId) => {
            const queryKeys = this.watchedQueryKeysByContextId[contextId];
            Object.keys(queryKeys).forEach((key) => {
                const query = queryKeys[key];
                keysBeingWatched[key] = query;
                // Always use hasOwnProperty because falsey key is valid
                if (!this.subscribedQueryKeys.hasOwnProperty(key)) {
                    toSubscribe[key] = query;
                }
            });
        });

        Object.keys(this.subscribedQueryKeys).forEach((key) => {
            const query = this.subscribedQueryKeys[key];
            if (!keysBeingWatched.hasOwnProperty(key)) {
                toUnsubscribe[key] = query;
            }
        });

        // Process subscribes first to allow for freeing up memory (if there
        // consequences to calling subscribe before unsubscribe, we can pass
        // in a config callback that defers unsubscribes)
        const toUnsubscribeQueries = Object.keys(toUnsubscribe).map((key) => {
            delete this.subscribedQueryKeys[key];
            return toUnsubscribe[key];
        });
        if (toUnsubscribeQueries.length) {
            this.config.unsubscribe(toUnsubscribeQueries);
        }
        const toSubscribeQueries = Object.keys(toSubscribe).map((key) => {
            const query = toSubscribe[key];
            this.subscribedQueryKeys[key] = query;
            return query;
        });
        if (toSubscribeQueries.length) {
            this.config.subscribe(toSubscribeQueries);
        }
    }

    /**
     * Schedule subscription update. Happens on a deferred basis from get
     * function to play nice with React, batch things.
     */
    protected scheduleSubscriptionUpdate() {
        if (this.pendingSubscriptionUpdate) return;
        this.pendingSubscriptionUpdate = true;

        // this.updateSubscriptions is autobound in constructor, should unset
        // this.pendingSubscriptionUpdate
        const defer = this.config.updateSubscription || requestAnimationFrame;
        defer(this.updateSubscriptions);
    }

    /**
     * Update context based on some external change (e.g. websocket event
     * or user action)
     * @param queries - If undefined, updates all. Otherwise, takes a list of
     * queries to update for (if keys match) or a custom test function
     */
    updateQueries(): void;
    updateQueries(queries: Q[]): void;
    updateQueries(queryTest: (q: Q) => boolean): void;
    updateQueries(param?: Q[]|((q: Q) => boolean)) {
        let testFn: (q: Q) => boolean;
        if (!param) testFn = () => true;
        else if (param instanceof Array) {
            testFn = q => !!param.find(
                p => this.queryToString(p) === this.queryToString(q),
            );
        }
        else {
            testFn = param;
        }

        // If there's a query function, only update subscriptions for which
        // there's a matching query
        Object.keys(this.watchedQueryKeysByContextId).forEach((id) => {
            const queryKeys = this.watchedQueryKeysByContextId[id];
            const doUpdate = !!Object.keys(queryKeys).find(
                key => testFn(queryKeys[key]),
            );
            if (doUpdate) {
                const context = this.watchedContexts[id];
                if (!context) {
                    throw new Error(`Unable to locate watched context '${id}'`);
                }

                /** @todo - debounced force update? */
                context.forceUpdate();
            }
        });
    }
}
