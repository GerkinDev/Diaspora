import * as _ from 'lodash';
import { SequentialEvent } from 'sequential-event';

import { Adapter as _AAdapterEntity } from './entity';
import AAdapterEntity = _AAdapterEntity.Base.AAdapterEntity;
import IAdapterEntityCtr = _AAdapterEntity.IAdapterEntityCtr;

import { remapIO, CANONICAL_OPERATORS, QUERY_OPTIONS_TRANSFORMS, IConstructable } from './adapter-utils';
import { QueryLanguage } from '../../types/queryLanguage';
import { IDataSourceQuerier } from '../../types/dataSourceQuerier';
import { logger } from '../../logger';
import { IEntityProperties, IEntityAttributes } from '../../types/entity';

export namespace Adapter {
	/**
	 * Represents the current state of the adapter. Those states corresponds to event names emitted by the adapter when they are passed.
	 *
	 * @author Gerkin
	 */
	export enum EAdapterState {
		READY = 'ready',
		ERROR = 'error',
		PREPARING = 'preparing',
	}

	export interface IAdapterCtr<TAdapterEntity extends AAdapterEntity = AAdapterEntity>
	extends IConstructable<Base.AAdapter<TAdapterEntity>> {
		new ( dataSourceName: string, ...args: any[] ): Base.AAdapter<TAdapterEntity>;
	}
}
export namespace Adapter.Base {
	/**
	 * Adapter is the base class of adapters. Adapters are components that are in charge to interact with data sources (files, databases, etc etc) with standardized methods. You should not use this class directly: extend this class and re-implement some methods to build an adapter. See the (upcoming) tutorial section.
	 * @extends SequentialEvent
	 * @author gerkin
	 * @see {@link https://gerkindev.github.io/SequentialEvent.js/SequentialEvent.html Sequential Event documentation}.
	 */
	export abstract class AAdapter<TAdapterEntity extends AAdapterEntity = AAdapterEntity>
	extends SequentialEvent
	implements IDataSourceQuerier<IEntityAttributes, IEntityProperties> {
		public get classEntity() {
			return this._classEntity;
		}
		
		/**
		 * Hash of functions to cast data store values to JSON standard values in entity.
		 *
		 * @author Gerkin
		 */
		protected filters: object;
		
		/**
		 * Hash to transform entity fields to data store fields.
		 *
		 * @author Gerkin
		 */
		protected remaps: object;
		
		/**
		 * Hash to transform data store fields to entity fields.
		 *
		 * @author Gerkin
		 */
		protected remapsInverted: object;
		
		/**
		 * Error triggered by adapter initialization.
		 *
		 * @author Gerkin
		 */
		protected error?: Error;
		
		/**
		 * Describe current adapter status.
		 *
		 * @author Gerkin
		 */
		protected state: EAdapterState;
		
		// -----
		// ### Initialization
		
		/**
		 * Create a new instance of adapter. This base class should be used by all other adapters.
		 *
		 * @author gerkin
		 * @param classEntity - Entity to spawn with this adapter.
		 */
		public constructor(
			protected _classEntity: IAdapterEntityCtr<TAdapterEntity>,
			public readonly name: string
		) {
			super();
			this.filters = {};
			this.remaps = {};
			this.remapsInverted = {};
			this.error = undefined;
			this.state = EAdapterState.PREPARING;
			
			// Bind events
			this.on( EAdapterState.READY, () => {
				this.state = EAdapterState.READY;
			} ).on( EAdapterState.ERROR, ( err: Error ) => {
				this.state = EAdapterState.ERROR;
				logger.error(
					'Error while initializing:',
					_.pick( err, Object.getOwnPropertyNames( err ) )
				);
				this.error = err;
			} );
		}
		
		/**
		 * Runs the query in loops to fulfill requirements in the options hash
		 *
		 * @author Gerkin
		 * @param options - Hash of options that forms the query
		 * @param query   - Query function to loop
		 */
		private static async iterateLimit(
			options: QueryLanguage.IQueryOptions,
			query: (
				options: QueryLanguage.IQueryOptions
			) => Promise<IEntityProperties | undefined>
		) {
			const foundEntities: IEntityProperties[] = [];
			const localOptions = _.assign( {}, options );
			let origSkip = localOptions.skip;
			
			// We are going to loop until we find enough items
			while ( foundEntities.length < localOptions.limit ) {
				const found = await query( localOptions );
				if ( _.isNil( found ) ) {
					return foundEntities;
				} else {
					foundEntities.push( found );
				}
				// Set the next query's offset as the original offset to which we add the current number of found elements
				localOptions.skip = origSkip + foundEntities.length;
			}
			return foundEntities;
		}
		
		// -----
		// ### Events
		
		/**
		 * Fired when the adapter is ready to use. You should not try to use the adapter before this event is emitted.
		 *
		 * @event Adapters.Adapter#ready
		 * @see {@link Adapters.Adapter#waitReady waitReady} Convinience method to wait for state change.
		 */
		
		/**
		 * Fired if the adapter failed to initialize or changed to `error` state. Called with the triggering `error`.
		 *
		 * @event Adapters.Adapter#error
		 * @see {@link Adapters.Adapter#waitReady waitReady} Convinience method to wait for state change.
		 */
		
		// -----
		// ### Utils
		
		/**
		 * Returns a promise resolved once adapter state is ready.
		 *
		 * @author gerkin
		 * @listens Adapters.Adapter#error
		 * @listens Adapters.Adapter#ready
		 * @returns Promise resolved when adapter is ready, and rejected if an error occured.
		 */
		public waitReady(): Promise<this> {
			return new Promise( ( resolve, reject ) => {
				if ( EAdapterState.READY === this.state ) {
					return resolve( this );
				} else if ( EAdapterState.ERROR === this.state ) {
					return reject( this.error );
				}
				
				this.on( EAdapterState.READY, () => resolve( this ) ).on(
					EAdapterState.ERROR,
					( err: Error ) => reject( err )
				);
			} );
		}
		
		/**
		 * TODO.
		 *
		 * @author gerkin
		 * @see TODO remapping.
		 * @see {@link Adapters.Adapter#remapIO remapIO}
		 */
		public remapInput<TProps extends IEntityAttributes>(
			tableName: string,
			query: TProps
		): TProps {
			return remapIO( this, tableName, query, true );
		}
		
		/**
		 * TODO.
		 *
		 * @author gerkin
		 * @see TODO remapping.
		 * @see {@link Adapters.Adapter#remapIO remapIO}
		 */
		public remapOutput<TProps extends IEntityAttributes>(
			tableName: string,
			query: TProps
		): TProps {
			return remapIO( this, tableName, query, false );
		}
		
		/**
		 * Transform options to their canonical form. This function must be applied before calling adapters' methods.
		 *
		 * @author gerkin
		 * @throws  {TypeError} Thrown if an option does not have an acceptable type.
		 * @throws  {ReferenceError} Thrown if a required option is not present.
		 * @throws  {Error} Thrown when there isn't more precise description of the error is available (eg. when conflicts occurs).
		 * @returns Transformed options (also called `canonical options`).
		 */
		public normalizeOptions(
			opts: QueryLanguage.Raw.IQueryOptions = {}
		): QueryLanguage.IQueryOptions {
			opts = _.cloneDeep( opts );
			_.forOwn( QUERY_OPTIONS_TRANSFORMS, ( transform, optionName ) => {
				if ( optionName in opts && !_.isNil( ( opts as any )[optionName] ) ) {
					transform( opts );
				}
			} );
			const optsDefaulted = _.defaults( opts, {
				skip: 0,
				remapInput: true,
				remapOutput: true,
				limit: Infinity,
			} );
			return optsDefaulted;
		}

		/**
		 * Normalize a single field query and checks types
		 * 
		 * @author Gerkin
		 * @param attrSearch - Search query to apply to the field
		 */
		protected static normalizeFieldQuery( attrSearch: QueryLanguage.Raw.ISelectQuery ): QueryLanguage.ISelectQuery{
			// Replace operations alias by canonical expressions
			const attrSearchCanonical = _.mapKeys( attrSearch, ( val, operator, obj ) => {
				if ( CANONICAL_OPERATORS.hasOwnProperty( operator ) ) {
					// ... check for conflict with canonical operation name...
					if ( obj.hasOwnProperty( CANONICAL_OPERATORS[operator] ) ) {
						throw new Error( `Search can't have both "${operator}" and "${CANONICAL_OPERATORS[operator]}" keys, as they are synonyms` );
					}
					return CANONICAL_OPERATORS[operator];
				}
				return operator;
			} );
			// For arithmetic comparison, check if values are numeric
			_.forEach( ['$less', '$lessEqual', '$greater', '$greaterEqual'], operation => {
				if (
					attrSearchCanonical.hasOwnProperty( operation ) &&
					!(
						_.isNumber( attrSearchCanonical[operation] ) ||
						_.isDate( attrSearchCanonical[operation] )
					)
				) {
					throw new TypeError( `Expect "${operation}" in ${JSON.stringify( attrSearchCanonical )} to be a numeric value` );
				}
			} );
			return attrSearchCanonical;
		}
		
		/**
		 * Transform a search query to its canonical form, replacing aliases or shorthands by full query.
		 *
		 * @author gerkin
		 */
		public normalizeQuery(
			originalQuery: QueryLanguage.Raw.SelectQueryOrCondition,
			options: QueryLanguage.IQueryOptions
		): QueryLanguage.SelectQueryOrCondition {
			const normalizedQuery = options.remapInput
			? _.chain( originalQuery ).cloneDeep().mapValues( attrSearch => {
				if ( _.isUndefined( attrSearch ) ) {
					return { $exists: false };
				} else if ( !( attrSearch instanceof Object ) ) {
					return { $equal: attrSearch };
				} else {
					return AAdapter.normalizeFieldQuery( attrSearch );
				}
			} ).value()
			: _.cloneDeep( originalQuery );
			return normalizedQuery;
		}
		
		/**
		 * Returns a POJO representing the current adapter.
		 *
		 * @returns JSON representation of the adapter.
		 */
		public toJSON(): object {
			return _.pick( this, [
				'state',
				'remaps',
				'remapsInverted',
				'classEntity',
				'error',
			] );
		}
		
		// -----
		// ### Insert
		
		/**
		 * Insert a single entity in the data store. This function is a default polyfill if the inheriting adapter does not provide `insertOne` itself.
		 *
		 * @summary At least one of {@link insertOne} or {@link insertMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async insertOne(
			table: string,
			entity: IEntityAttributes
		): Promise<IEntityProperties | undefined> {
			return _.first( await this.insertMany( table, [entity] ) );
		}
		
		/**
		 * Insert several entities in the data store. This function is a default polyfill if the inheriting adapter does not provide `insertMany` itself.
		 *
		 * @summary At least one of {@link insertOne} or {@link insertMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async insertMany(
			table: string,
			entities: IEntityAttributes[]
		): Promise<IEntityProperties[]> {
			const mapped = [];
			for ( let i = 0; i < entities.length; i++ ) {
				mapped.push( await this.insertOne( table, entities[i] || {} ) );
			}
			return _.compact( mapped );
		}
		
		// -----
		// ### Find
		
		/**
		 * Retrieve a single entity from the data store. This function is a default polyfill if the inheriting adapter does not provide `findOne` itself.
		 *
		 * @summary At least one of {@link findOne} or {@link findMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async findOne(
			table: string,
			queryFind: QueryLanguage.SelectQueryOrCondition,
			options: QueryLanguage.IQueryOptions
		): Promise<IEntityProperties | undefined> {
			options.limit = 1;
			return _.first( await this.findMany( table, queryFind, options ) );
		}
		
		/**
		 * Retrieve several entities from the data store. This function is a default polyfill if the inheriting adapter does not provide `findMany` itself.
		 *
		 * @summary At least one of {@link findOne} or {@link findMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async findMany(
			table: string,
			queryFind: QueryLanguage.SelectQueryOrCondition,
			options: QueryLanguage.IQueryOptions
		): Promise<IEntityProperties[]> {
			const boundQuery = this.findOne.bind( this, table, queryFind );
			return AAdapter.iterateLimit( options, boundQuery );
		}
		
		// -----
		// ### Update
		
		/**
		 * Update a single entity from the data store. This function is a default polyfill if the inheriting adapter does not provide `updateOne` itself.
		 *
		 * @summary At least one of {@link updateOne} or {@link updateMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async updateOne(
			table: string,
			queryFind: QueryLanguage.SelectQueryOrCondition,
			update: IEntityAttributes,
			options: QueryLanguage.IQueryOptions
		): Promise<IEntityProperties | undefined> {
			options.limit = 1;
			return _.first( await this.updateMany( table, queryFind, update, options ) );
		}
		
		/**
		 * Update several entities from the data store. This function is a default polyfill if the inheriting adapter does not provide `updateMany` itself.
		 *
		 * @summary At least one of {@link updateOne} or {@link updateMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async updateMany(
			table: string,
			queryFind: QueryLanguage.SelectQueryOrCondition,
			update: IEntityAttributes,
			options: QueryLanguage.IQueryOptions
		): Promise<IEntityProperties[]> {
			return AAdapter.iterateLimit(
				options,
				this.updateOne.bind( this, table, queryFind, update )
			);
		}
		
		// -----
		// ### Delete
		
		/**
		 * Delete a single entity from the data store. This function is a default polyfill if the inheriting adapter does not provide `deleteOne` itself.
		 *
		 * @summary At least one of {@link deleteOne} or {@link deleteMany} must be reimplemented by adapter.
		 * @author gerkin
		 */
		public async deleteOne(
			table: string,
			queryFind: QueryLanguage.SelectQueryOrCondition,
			options: QueryLanguage.IQueryOptions
		): Promise<void> {
			options.limit = 1;
			await this.deleteMany( table, queryFind, options );
		}
		
		/**
		 * Delete several entities from the data store. This function is a default polyfill if the inheriting adapter does not provide `deleteMany` itself.
		 *
		 * @summary At least one of {@link deleteOne} or {@link deleteMany} must be reimplemented by adapter.
		 * @author gerkin
		 * @param   table     - Name of the table to delete data from.
		 * @param   queryFind - Hash representing the entities to find.
		 * @param   options   - Hash of options.
		 * @returns Promise resolved once item is found. Called with (*{@link DataStoreEntity}[]* `entities`).
		 */
		public async deleteMany(
			table: string,
			queryFind: QueryLanguage.SelectQueryOrCondition,
			options: QueryLanguage.IQueryOptions
		): Promise<void> {
			const boundQuery = this.deleteOne.bind( this, table, queryFind );
			await AAdapter.iterateLimit( options, boundQuery );
		}
		
		/**
		 * Saves the remapping table, the reversed remapping table and the filter table in the adapter. Those tables will be used later when manipulating models & entities.
		 *
		 * @author gerkin
		 */
		public configureCollection(
			tableName: string,
			remaps: _.Dictionary<string> = {},
			filters: _.Dictionary<any> = {}
		): this {
			( this.remaps as any )[tableName] = {
				normal: remaps,
				inverted: _.invert( remaps ),
			};
			( this.filters as any )[tableName] = filters;
			return this;
		}
	}
}
