import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  GetReplayFile200Response,
  ListReplayFileProcessingAttempts200Response,
  ListReplayFiles200Response,
  ParserReplayData,
  ReplayIngestionRequest,
} from '../../generated/v1/models';
import { ReplayValidationError } from './replays.errors';
import { ReplaysRepository } from './replays.repository';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const parseModes = ['EventsOnly', 'Minimal', 'Normal', 'Full'];
const attemptStatuses = ['accepted', 'processing', 'succeeded', 'failed', 'skipped'];
const fileStatuses = ['unprocessed', ...attemptStatuses];

type Shape = string | { array: Shape; nullableItems?: boolean } | { object: Record<string, Shape> } | { json: true };

const vector2 = object({ x: 'number', y: 'number' });
const vector3 = object({ x: 'number', y: 'number', z: 'number', scaleFactor: 'int32', bits: 'int32' });
const rotator = object({ pitch: 'number', yaw: 'number', roll: 'number' });
const quaternion = object({ x: 'float', y: 'float', z: 'float', w: 'float' });
const eventActor = object({
  id: 'string', playerType: 'playerType', location: vector3, rotation: quaternion, scale: vector3,
});
const replicatedMovement = object({
  location: vector3, rotation: rotator, linearVelocity: vector3, angularVelocity: vector3,
  acceleration: vector3, bSimulatedPhysicSleep: 'boolean', bRepPhysics: 'boolean',
  bRepAcceleration: 'boolean', serverFrame: 'integer', handle: 'integer',
  locationQuantizationLevel: 'integer', velocityQuantizationLevel: 'integer',
  rotationQuantizationLevel: 'integer',
});
const movement = object({
  pawnActorId: 'integer', replicatedWorldTimeSeconds: 'number',
  replicatedWorldTimeSecondsDouble: 'number', lastUpdateTime: 'number',
  replicatedMovement, replicatedMovementMode: 'integer', currentMovementStyle: 'integer',
  bIsSprinting: 'boolean', bIsJumping: 'boolean', bIsCrouched: 'boolean',
  bIsSlopeSliding: 'boolean', bIsZiplining: 'boolean', bIsTargeting: 'boolean',
  bIsDBNO: 'boolean', bIsHonking: 'boolean', bIsInAnyStorm: 'boolean',
  bIsWaitingForEmoteInteraction: 'boolean', bIsPlayingEmote: 'boolean',
  bIsSkydiving: 'boolean', bIsSkydivingFromLaunchPad: 'boolean',
  bIsSkydivingFromBus: 'boolean', bIsParachuteOpen: 'boolean',
  bIsParachuteForcedOpen: 'boolean', bIsInWaterVolume: 'boolean',
  vehicle: 'integer', vehiclePath: 'string', seatIndex: 'integer',
});
const gameState = object({
  worldTimeSeconds: 'number', replicatedWorldTimeSeconds: 'number',
  replicatedWorldTimeSecondsDouble: 'number', hasBegunPlay: 'boolean',
  teamCount: 'integer', teamSize: 'integer',
  playerBotsLeft: 'integer', playersLeft: 'integer', teamsLeft: 'integer',
  elapsedTime: 'integer', gamePhase: 'integer', safeZonePhase: 'integer',
});
const gameData = object({
  gameSessionId: 'string', utcTimeStartedMatch: 'string', matchEndTime: 'number',
  currentPlaylist: 'string', mapInfo: 'string', additionalPlaylistLevels: array('string'),
  activeGameplayModifiers: array('string'), recorderId: 'integer', maxPlayers: 'integer',
  totalTeams: 'integer', totalBots: 'integer', tournamentRound: 'integer',
  isLargeTeamGame: 'boolean', teamCount: 'integer',
  teamSize: 'integer', playerBotsLeft: 'integer', playersLeft: 'integer', teamsLeft: 'integer',
  elapsedTime: 'integer', gamePhase: 'integer', safeZonePhase: 'integer',
  hasBegunPlay: 'boolean', totalPlayerStructures: 'integer', winningTeam: 'integer',
  winningPlayerIds: array('integer'), aircraftStartTime: 'number', safeZonesStartTime: 'number',
  gameStateObservations: array(gameState),
});
const eventInfo = object({
  id: 'string', group: 'string', metadata: 'string', startTime: 'integer',
  endTime: 'integer', sizeInBytes: 'integer',
});
const stats = object({
  info: eventInfo,
  totalTraveled: 'number', accuracy: 'number', unknown: 'integer', assists: 'integer',
  eliminations: 'integer', weaponDamage: 'integer', otherDamage: 'integer',
  revives: 'integer', damageTaken: 'integer', damageToStructures: 'integer',
  materialsGathered: 'integer', materialsUsed: 'integer',
});
const player = object({
  id: 'integer', playerId: 'string', epicId: 'string', platformUniqueNetId: 'string',
  botId: 'string', isBot: 'boolean', playerName: 'string',
  playerNameCustomOverride: 'string', streamerModeName: 'string', platform: 'string',
  level: 'integer', seasonLevelUIDisplay: 'integer', playerNumber: 'integer',
  inventoryId: 'uint32',
  teamIndex: 'integer', isPartyLeader: 'boolean', isReplayOwner: 'boolean',
  isGameSessionOwner: 'boolean', hasFinishedLoading: 'boolean', hasStartedPlaying: 'boolean',
  hasThankedBusDriver: 'boolean', isUsingStreamerMode: 'boolean',
  isUsingAnonymousMode: 'boolean', disconnected: 'boolean', rebootCounter: 'integer',
  placement: 'integer', kills: 'integer', teamKills: 'integer', deathCause: 'integer',
  deathCircumstance: 'integer', deathTags: array('string'), deathLocation: vector3,
  deathTime: 'number', deathTimeDouble: 'number',
  cosmetics: object({
    character: { json: true }, parts: { json: true }, gender: { json: true },
    type: { json: true }, banner: { json: true }, backpack: { json: true },
    glider: { json: true }, pickaxe: { json: true }, wraps: { json: true },
    contrail: { json: true }, dances: { json: true },
    characterGender: 'integer', characterBodyType: 'integer', heroType: 'string',
    bannerColorId: 'string', bannerIconId: 'string', itemWraps: array('string', true),
    variantRequiredCharacterParts: array('string', true), isDefaultCharacter: 'boolean',
    loadingScreen: 'string', musicPack: 'string', petSkin: 'string', skyDiveContrail: 'string',
  }),
  currentWeapon: 'integer', locations: array(movement),
});
const team = object({
  teamIndex: 'integer', playerIds: array('integer', true), playerNames: array('string', true),
  partyOwnerId: 'integer', placement: 'integer', teamKills: 'integer',
});
const eventElimination = object({
  eventInfo: object({
    id: 'string', group: 'string', metadata: 'string', startTime: 'number',
    endTime: 'number', sizeInBytes: 'integer',
  }),
  eliminated: eventActor, eliminator: eventActor,
  gunType: 'integer', knocked: 'boolean', libraryDistance: 'number',
});
const killFeed = object({
  playerId: 'integer', playerName: 'string', playerIsBot: 'boolean',
  finisherOrDowner: 'integer', finisherOrDownerName: 'string',
  finisherOrDownerIsBot: 'boolean', replicatedWorldTimeSeconds: 'number',
  replicatedWorldTimeSecondsDouble: 'number', distance: 'number', deathCause: 'integer',
  deathCircumstance: 'integer', deathLocation: vector3, deathTags: array('string'),
  isDowned: 'boolean', isRevived: 'boolean',
});
const map = object({
  battleBusFlightPaths: array(object({
    index: 'integer', start: vector3, rotation: rotator, velocity: vector3,
    flightTime: 'number', dropTime: 'number', skin: 'string',
  })),
  worldGridStart: vector2, worldGridEnd: vector2, worldGridSpacing: vector2,
  worldGridTotalSize: vector2, gridCountX: 'integer', gridCountY: 'integer',
  poiTagContainerTable: array('string'), poiTagContainerTableSize: 'integer',
  safeZones: array(object({
    center: vector3, radius: 'number', startShrinkTime: 'number', finishShrinkTime: 'number',
    lastRadius: 'number', nextRadius: 'number', nextNextRadius: 'number',
    lastCenter: vector3, nextCenter: vector3, nextNextCenter: vector3,
  })),
  llamas: array(object({ position: vector3, destination: vector3, looted: 'boolean' })),
  supplyDrops: array(object({
    landingPosition: vector3, fallPosition: vector3, balloonPosition: vector3, looted: 'boolean',
  })),
  rebootVans: array(object({
    guid: 'string', handle: 'integer', location: vector3, state: 'integer',
  })),
});
const observations = object({
  equippedItems: array(object({
    timeSeconds: 'number', name: 'string', item: 'string', pawnActorId: 'integer', playerId: 'integer',
  })),
  containerInteractions: array(object({
    timeSeconds: 'number', sourceActorKey: 'string', containerLabel: 'string',
    searchingPawnActorId: 'integer', searchingPlayerStateActorId: 'integer',
    searchingPlayerId: 'integer', alreadySearched: 'boolean',
    searchAnimationCount: 'integer', destroyed: 'boolean',
  })),
  droppedItems: array(object({
    timeSeconds: 'number', item: 'string', itemDefinitionActorId: 'integer',
    itemDefinitionPath: 'string', count: 'integer', durability: 'number',
    level: 'integer', loadedAmmo: 'integer', orderIndex: 'integer', itemOwner: 'integer',
    pawnWhoDroppedPickup: 'integer', owner: 'integer', droppedByPlayerId: 'integer',
    replicatedLocation: vector3, lootInitialPosition: vector3, lootFinalPosition: vector3,
    finalTossRestLocation: vector3, flyTime: 'number', tossState: 'integer', pickedUp: 'boolean',
  })),
  treasureEvents: array(object({
    timeSeconds: 'number', prizeId: 'string', pawnActorId: 'integer',
    playerId: 'integer', sourceContainer: 'string',
  })),
  prizeHandlerGrants: array(object({
    handler: 'string', time: 'number', playerState: 'integer', playerId: 'integer',
  })),
});

@Injectable()
export class ReplaysService {
  constructor(private readonly repository: ReplaysRepository) {}

  async accept(
    fileSha256: string,
    input: unknown,
    rawPayload: Buffer,
  ): Promise<Awaited<ReturnType<ReplaysRepository['accept']>>> {
    validateSha256(fileSha256);
    const request = validateIngestionEnvelope(input);
    if (rawPayload.length === 0 || rawPayload.length > 50 * 1024 * 1024) {
      throw new ReplayValidationError('Replay request body must be between 1 byte and 50 MB.');
    }
    const requestSha256 = createHash('sha256').update(stableSerialize(request)).digest('hex');
    const payloadSha256 = createHash('sha256').update(rawPayload).digest('hex');
    return this.repository.accept(fileSha256, request, requestSha256, payloadSha256, rawPayload);
  }

  async listReplayFiles(
    applicationId: unknown,
    status: unknown,
    page: unknown,
    pageSize: unknown,
  ): Promise<ListReplayFiles200Response> {
    const app = optionalString(applicationId, 'application_id', 150);
    const filterStatus = optionalEnum(status, fileStatuses, 'status');
    return this.repository.listReplayFiles(
      app,
      filterStatus,
      parsePage(page, 1, 'page'),
      parsePage(pageSize, 25, 'page_size', 100),
    );
  }

  async getReplayFile(sha256: string): Promise<GetReplayFile200Response> {
    validateSha256(sha256);
    return this.repository.getReplayFile(sha256);
  }

  async listAttempts(
    sha256: string,
    status: unknown,
    page: unknown,
    pageSize: unknown,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    validateSha256(sha256);
    return this.repository.listAttempts(
      sha256,
      optionalEnum(status, attemptStatuses, 'status'),
      parsePage(page, 1, 'page'),
      parsePage(pageSize, 25, 'page_size', 100),
    );
  }

  async listMatchAttempts(
    matchId: number | string,
    page: unknown,
    pageSize: unknown,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    const parsedMatchId = typeof matchId === 'number'
      ? matchId
      : /^\d+$/.test(matchId) ? Number(matchId) : NaN;
    if (!Number.isSafeInteger(parsedMatchId) || parsedMatchId < 1) {
      throw new ReplayValidationError('match_id must be a positive safe integer.');
    }
    return this.repository.listMatchAttempts(
      parsedMatchId,
      parsePage(page, 1, 'page'),
      parsePage(pageSize, 25, 'page_size', 100),
    );
  }

  async prepareAccepted(rawPayload: Buffer): Promise<{
    input: ReplayIngestionRequest;
    inconsistencies: string;
    containerMetrics: ContainerNormalizationMetrics;
  }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload.toString('utf8')) as unknown;
    } catch (error) {
      throw new ReplayValidationError(
        `Persisted replay request is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`,
      );
    }

    const input = validateIngestionEnvelope(parsed);
    const inconsistencies: InconsistencyCollector = { count: 0, entries: [], containerFieldIssues: 0 };
    const source = parsed as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      if (!['application_id', 'idempotency_key', 'analyzer_version', 'data'].includes(key)) {
        recordInconsistency(inconsistencies, `request.${key}`, 'unknown_property');
      }
    }
    const analyzer = input.analyzer_version as unknown as Record<string, unknown>;
    for (const key of Object.keys(analyzer)) {
      if (!['application_version', 'analyzer_version', 'parser_name', 'parser_version', 'description'].includes(key)) {
        recordInconsistency(inconsistencies, `analyzer_version.${key}`, 'unknown_property');
      }
    }

    const originalData = input.data as unknown as Record<string, unknown>;
    const originalObservations = originalData.observations;
    const hasContainerObservations = originalObservations !== null
      && typeof originalObservations === 'object'
      && !Array.isArray(originalObservations)
      && Object.prototype.hasOwnProperty.call(originalObservations, 'containerInteractions');
    const originalContainerEvents = hasContainerObservations
      ? (originalObservations as Record<string, unknown>).containerInteractions : undefined;
    const rawContainerEvents = Array.isArray(originalContainerEvents) ? originalContainerEvents : [];
    const detectedContainerEvents = rawContainerEvents.length;
    const exactContainerDuplicates = countExactDuplicates(rawContainerEvents);
    const data = structuredClone(input.data) as unknown;
    normalizeKnownAliases(data, inconsistencies);
    const normalizedData = sanitizeValue(data, dataShape(), 'data', inconsistencies);
    if (normalizedData === null || typeof normalizedData !== 'object' || Array.isArray(normalizedData)) {
      throw new ReplayValidationError('data must be an object.');
    }
    const normalized: ReplayIngestionRequest = {
      application_id: input.application_id,
      idempotency_key: input.idempotency_key,
      analyzer_version: {
        application_version: input.analyzer_version.application_version,
        analyzer_version: input.analyzer_version.analyzer_version,
        parser_name: input.analyzer_version.parser_name,
        parser_version: input.analyzer_version.parser_version,
        ...(input.analyzer_version.description === undefined
          ? {} : { description: input.analyzer_version.description }),
      },
      data: normalizedData as ParserReplayData,
    };
    validateIngestion(normalized);
    const normalizedContainerEvents = normalized.data.observations?.containerInteractions ?? [];
    const rejectionSamples = inconsistencies.entries
      .filter((entry) => entry.startsWith('data.observations.containerInteractions'))
      .slice(0, 20);
    return {
      input: normalized,
      inconsistencies: serializeInconsistencies(inconsistencies),
      containerMetrics: {
        provided: hasContainerObservations,
        detected: detectedContainerEvents,
        valid: normalizedContainerEvents.length,
        rejected: Math.max(0, detectedContainerEvents - normalizedContainerEvents.length),
        exactDuplicates: exactContainerDuplicates,
        fieldIssues: inconsistencies.containerFieldIssues,
        rejectionSamples,
      },
    };
  }

  async ingest(
    fileSha256: string,
    input: ReplayIngestionRequest,
    requestSha256Override?: string,
    inconsistencies?: string,
    payloadSha256Override?: string | null,
    containerMetrics?: ContainerNormalizationMetrics,
  ): Promise<{
    outcome: 'created' | 'replayed' | 'processing' | 'failed';
    attempt: Awaited<ReturnType<ReplaysRepository['ingest']>>['attempt'];
    containerPersistence?: Awaited<ReturnType<ReplaysRepository['ingest']>>['containerPersistence'];
  }> {
    validateSha256(fileSha256);
    validateIngestion(input);
    const requestSha256 = requestSha256Override ?? createHash('sha256')
      .update(stableSerialize(input))
      .digest('hex');
    const payloadSha256 = payloadSha256Override ?? createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    const result = await this.repository.ingest(
      fileSha256, input, requestSha256, inconsistencies, payloadSha256, containerMetrics,
    );
    return {
      outcome: result.outcome,
      attempt: result.attempt,
      containerPersistence: result.containerPersistence,
    };
  }
}

function validateIngestionEnvelope(input: unknown): ReplayIngestionRequest {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReplayValidationError('request must be an object.');
  }
  const value = input as Record<string, unknown>;
  if (typeof value.application_id !== 'string' || value.application_id.length === 0) {
    throw new ReplayValidationError('application_id is required.');
  }
  if (value.application_id.length > 150) {
    throw new ReplayValidationError('application_id must be at most 150 characters.');
  }
  const configuredApplication = process.env.REPLAY_APPLICATION_ID ?? 'chestcounter';
  if (value.application_id !== configuredApplication) {
    throw new ReplayValidationError('application_id is not configured for Replay ingestion.');
  }
  if (typeof value.idempotency_key !== 'string'
      || value.idempotency_key.length < 1 || value.idempotency_key.length > 200) {
    throw new ReplayValidationError('idempotency_key must contain 1 to 200 characters.');
  }
  const analyzer = value.analyzer_version;
  if (analyzer === null || typeof analyzer !== 'object' || Array.isArray(analyzer)) {
    throw new ReplayValidationError('analyzer_version must be an object.');
  }
  const version = analyzer as Record<string, unknown>;
  for (const [field, maxLength] of [
    ['application_version', 50],
    ['analyzer_version', 50],
    ['parser_name', 100],
    ['parser_version', 100],
  ] as const) {
    const fieldValue = version[field];
    if (typeof fieldValue !== 'string' || fieldValue.length < 1 || fieldValue.length > maxLength) {
      throw new ReplayValidationError(`${field} must contain 1 to ${maxLength} characters.`);
    }
  }
  if (version.description != null
      && (typeof version.description !== 'string' || version.description.length > 500)) {
    throw new ReplayValidationError('analyzer_version.description must be a string of at most 500 characters.');
  }
  if (value.data === null || typeof value.data !== 'object' || Array.isArray(value.data)) {
    throw new ReplayValidationError('data must be an object.');
  }
  return input as ReplayIngestionRequest;
}

function validateIngestion(input: ReplayIngestionRequest): void {
  assertObject(input, 'request', {
    application_id: 'string',
    idempotency_key: 'string',
    analyzer_version: object({
      application_version: 'string',
      analyzer_version: 'string',
      parser_name: 'string',
      parser_version: 'string',
      description: 'string',
    }),
    data: { json: true },
  }, ['application_id', 'idempotency_key', 'analyzer_version', 'data']);

  if (typeof input.application_id !== 'string' || input.application_id.length === 0) {
    throw new ReplayValidationError('application_id is required.');
  }
  if (input.application_id.length > 150) {
    throw new ReplayValidationError('application_id must be at most 150 characters.');
  }
  const configuredApplication = process.env.REPLAY_APPLICATION_ID ?? 'chestcounter';
  if (input.application_id !== configuredApplication) {
    throw new ReplayValidationError('application_id is not configured for Replay ingestion.');
  }
  if (typeof input.idempotency_key !== 'string' || input.idempotency_key.length < 1 || input.idempotency_key.length > 200) {
    throw new ReplayValidationError('idempotency_key must contain 1 to 200 characters.');
  }
  if (
    input.analyzer_version === null
    || typeof input.analyzer_version !== 'object'
    || Array.isArray(input.analyzer_version)
  ) {
    throw new ReplayValidationError('analyzer_version must be an object.');
  }
  assertObject(input.analyzer_version, 'analyzer_version', {
    application_version: 'string',
    analyzer_version: 'string',
    parser_name: 'string',
    parser_version: 'string',
    description: 'string',
  }, ['application_version', 'analyzer_version', 'parser_name', 'parser_version']);
  const version = input.analyzer_version;
  for (const [field, value, maxLength] of [
    ['application_version', version.application_version, 50],
    ['analyzer_version', version.analyzer_version, 50],
    ['parser_name', version.parser_name, 100],
    ['parser_version', version.parser_version, 100],
  ] as const) {
    if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
      throw new ReplayValidationError(`${field} must contain 1 to ${maxLength} characters.`);
    }
  }
  if (version.description != null && version.description.length > 500) {
    throw new ReplayValidationError('analyzer_version.description must be at most 500 characters.');
  }
  validateData(input.data);
}

function validateData(data: ParserReplayData): void {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ReplayValidationError('data must be an object.');
  }
  const schema = dataShape();
  validateValue(data, schema, 'data');
  for (const [index, item] of (data.weapons ?? []).entries()) {
    for (const [legacy, source] of [['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd']] as const) {
      rejectConflictingAliases(item, legacy, source, `data.weapons[${index}]`);
    }
  }
  for (const [index, item] of (data.observations?.equippedItems ?? []).entries()) {
    rejectConflictingAliases(item, 'name', 'item', `data.observations.equippedItems[${index}]`);
  }
  if (typeof data.parseMode !== 'string' || !parseModes.includes(data.parseMode)) {
    throw new ReplayValidationError('data.parseMode is not a supported parser mode.');
  }
  const playerIds = (data.players ?? [])
    .map((item) => item.id)
    .filter((id): id is number => id !== undefined && id !== null);
  if (new Set(playerIds).size !== playerIds.length) {
    throw new ReplayValidationError('data.players IDs must be unique when present.');
  }
}

function dataShape(): Shape {
  return object({
    parseMode: 'string', match: object({
      gameData, replayTimestamp: 'string', replayLengthInMilliseconds: 'integer',
      replayBranch: 'string', stats,
      teamStats: object({ info: eventInfo, unknown: 'integer', position: 'integer', totalPlayers: 'integer' }),
    }),
    players: array(player), teams: array(team),
    eventEliminations: array(eventElimination), killFeed: array(killFeed),
    map,
    weapons: array(object({
      actorId: 'integer', weaponName: 'string', ammoCount: 'integer',
      weaponLevel: 'integer', lastFireTimeVerified: 'number',
      bIsEquippingWeapon: 'boolean', bIsReloadingWeapon: 'boolean',
      A: 'integer', B: 'integer', C: 'integer', D: 'integer',
      a: 'integer', b: 'integer', c: 'integer', d: 'integer',
    })),
    observations,
  });
}

interface InconsistencyCollector {
  count: number;
  entries: string[];
  containerFieldIssues: number;
}

export interface ContainerNormalizationMetrics {
  provided: boolean;
  detected: number;
  valid: number;
  rejected: number;
  exactDuplicates: number;
  fieldIssues: number;
  rejectionSamples: string[];
}

function recordInconsistency(
  collector: InconsistencyCollector,
  path: string,
  kind: string,
): void {
  collector.count += 1;
  if (path.startsWith('data.observations.containerInteractions')) {
    collector.containerFieldIssues += 1;
  }
  if (collector.entries.length < 100) collector.entries.push(`${path.slice(0, 300)}:${kind}`);
}

function countExactDuplicates(items: unknown[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const key = stableSerialize(item);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function serializeInconsistencies(collector: InconsistencyCollector): string {
  if (collector.count === 0) return '';
  return JSON.stringify({
    count: collector.count,
    truncated: collector.count > collector.entries.length,
    entries: collector.entries,
  });
}

function normalizeKnownAliases(value: unknown, issues: InconsistencyCollector): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  const data = value as Record<string, unknown>;
  if (Array.isArray(data.players)) {
    const seenIds = new Set<number>();
    data.players = data.players.filter((player, index) => {
      if (player === null || typeof player !== 'object' || Array.isArray(player)) return true;
      const id = (player as Record<string, unknown>).id;
      if (typeof id !== 'number' || !Number.isSafeInteger(id)) return true;
      if (seenIds.has(id)) {
        recordInconsistency(issues, `data.players[${index}].id`, 'duplicate_player_id');
        return false;
      }
      seenIds.add(id);
      return true;
    });
  }
  if (Array.isArray(data.weapons)) {
    data.weapons.forEach((weapon, index) => {
      if (weapon === null || typeof weapon !== 'object' || Array.isArray(weapon)) return;
      const item = weapon as Record<string, unknown>;
      for (const [legacy, canonical] of [['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd']] as const) {
        if (!Object.prototype.hasOwnProperty.call(item, legacy)) continue;
        if (!Object.prototype.hasOwnProperty.call(item, canonical)) item[canonical] = item[legacy];
        else if (item[canonical] !== item[legacy]) {
          recordInconsistency(issues, `data.weapons[${index}].${legacy}`, 'conflicting_alias');
        }
        delete item[legacy];
      }
    });
  }
  const observationsValue = data.observations;
  if (observationsValue === null || typeof observationsValue !== 'object' || Array.isArray(observationsValue)) return;
  const equippedItems = (observationsValue as Record<string, unknown>).equippedItems;
  if (Array.isArray(equippedItems)) {
    equippedItems.forEach((item, index) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return;
      const entry = item as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(entry, 'name')
          && Object.prototype.hasOwnProperty.call(entry, 'item')
          && entry.name !== entry.item) {
        recordInconsistency(issues, `data.observations.equippedItems[${index}].name`, 'conflicting_alias');
        delete entry.name;
      } else if (Object.prototype.hasOwnProperty.call(entry, 'name')
          && !Object.prototype.hasOwnProperty.call(entry, 'item')) {
        entry.item = entry.name;
        delete entry.name;
      }
    });
  }
  const grants = (observationsValue as Record<string, unknown>).prizeHandlerGrants;
  if (!Array.isArray(grants)) return;
  grants.forEach((grant, index) => {
    if (grant === null || typeof grant !== 'object' || Array.isArray(grant)) return;
    const item = grant as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(item, 'timeSeconds')) return;
    if (!Object.prototype.hasOwnProperty.call(item, 'time')) item.time = item.timeSeconds;
    else if (item.time !== item.timeSeconds) {
      recordInconsistency(issues, `data.observations.prizeHandlerGrants[${index}].timeSeconds`, 'conflicting_alias');
    }
    delete item.timeSeconds;
  });
}

function sanitizeValue(value: unknown, shape: Shape, path: string, issues: InconsistencyCollector): unknown {
  if (value === null) return null;
  if (typeof shape === 'object' && 'array' in shape) {
    if (!Array.isArray(value)) {
      recordInconsistency(issues, path, 'expected_array');
      return null;
    }
    return value.flatMap((item, index) => {
      if (item === null && !shape.nullableItems) {
        recordInconsistency(issues, `${path}[${index}]`, 'null_array_item');
        return [];
      }
      const normalized = sanitizeValue(item, shape.array, `${path}[${index}]`, issues);
      if (normalized === null && !shape.nullableItems && isObjectShape(shape.array)) return [];
      return [normalized];
    });
  }
  if (typeof shape === 'object' && 'object' in shape) {
    if (typeof value !== 'object' || Array.isArray(value)) {
      recordInconsistency(issues, path, 'expected_object');
      return null;
    }
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(source)) {
      if (!Object.prototype.hasOwnProperty.call(shape.object, key)) {
        recordInconsistency(issues, `${path}.${key}`, 'unknown_property');
        continue;
      }
      const nestedShape = shape.object[key];
      normalized[key] = sanitizeValue(nested, nestedShape, `${path}.${key}`, issues);
    }
    return normalized;
  }
  if (typeof shape === 'object' && 'json' in shape) {
    if (isJsonCompatible(value)) return value;
    recordInconsistency(issues, path, 'invalid_json_value');
    return null;
  }
  if (isValidScalar(value, shape)) return value;
  recordInconsistency(issues, path, 'invalid_value');
  return null;
}

function isObjectShape(shape: Shape): shape is { object: Record<string, Shape> } {
  return typeof shape === 'object' && 'object' in shape;
}

function isValidScalar(value: unknown, shape: Shape): boolean {
  if (typeof shape !== 'string') return false;
  if (shape === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  if (shape === 'int32' || shape === 'uint32') {
    const min = shape === 'int32' ? -2147483648 : 0;
    const max = shape === 'int32' ? 2147483647 : 4294967295;
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  }
  if (shape === 'playerType') {
    return typeof value === 'string'
      || (typeof value === 'number' && Number.isInteger(value)
        && value >= -2147483648 && value <= 2147483647);
  }
  if (shape === 'number' || shape === 'float') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return typeof value === shape;
}

function isJsonCompatible(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonCompatible);
  if (typeof value === 'object') return Object.values(value).every(isJsonCompatible);
  return false;
}

function rejectConflictingAliases(value: object, first: string, second: string, label: string): void {
  const entries = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(entries, first)
      && Object.prototype.hasOwnProperty.call(entries, second)
      && entries[first] !== entries[second]) {
    throw new ReplayValidationError(`${label}.${first} and ${label}.${second} must agree when both are present.`);
  }
}

function assertObject(
  value: unknown,
  label: string,
  schema: Record<string, Shape>,
  required: string[],
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReplayValidationError(`${label} must be an object.`);
  }
  const objectValue = value as Record<string, unknown>;
  for (const key of Object.keys(objectValue)) {
    if (!(key in schema)) throw new ReplayValidationError(`${label}.${key} is not allowed.`);
    validateValue(objectValue[key], schema[key], `${label}.${key}`);
  }
  for (const key of required) {
    if (!(key in objectValue)) throw new ReplayValidationError(`${label}.${key} is required.`);
  }
}

function validateValue(value: unknown, shape: Shape, label: string): void {
  if (value === null) return;
  if (typeof shape === 'object' && 'array' in shape) {
    if (!Array.isArray(value)) throw new ReplayValidationError(`${label} must be an array.`);
    value.forEach((item, index) => {
      if (item === null && !shape.nullableItems) {
        throw new ReplayValidationError(`${label}[${index}] must not be null.`);
      }
      validateValue(item, shape.array, `${label}[${index}]`);
    });
    return;
  }
  if (typeof shape === 'object' && 'object' in shape) {
    assertObject(value, label, shape.object, []);
    return;
  }
  if (typeof shape === 'object' && 'json' in shape) {
    validateJson(value, label);
    return;
  }
  if (shape === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new ReplayValidationError(`${label} must be a safe integer.`);
    }
    return;
  }
  if (shape === 'int32' || shape === 'uint32') {
    const min = shape === 'int32' ? -2147483648 : 0;
    const max = shape === 'int32' ? 2147483647 : 4294967295;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new ReplayValidationError(`${label} must be an integer from ${min} to ${max}.`);
    }
    return;
  }
  if (shape === 'playerType') {
    if (typeof value !== 'string'
        && (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)) {
      throw new ReplayValidationError(`${label} must be a string or integer.`);
    }
    return;
  }
  if (shape === 'float') {
    if ((typeof value === 'number' && Number.isFinite(value))
        || value === 'NaN' || value === 'Infinity' || value === '-Infinity') return;
    throw new ReplayValidationError(`${label} must be a finite number or a named floating-point literal.`);
  }
  if (shape === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ReplayValidationError(`${label} must be a finite number.`);
    }
    return;
  }
  if (typeof value !== shape) throw new ReplayValidationError(`${label} must be a ${shape}.`);
}

function validateJson(value: unknown, label: string): void {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJson(item, `${label}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) validateJson(nested, `${label}.${key}`);
    return;
  }
  throw new ReplayValidationError(`${label} must contain JSON-compatible values.`);
}

function object(properties: Record<string, Shape>): Shape {
  return { object: properties };
}

function array(item: Shape, nullableItems = false): Shape {
  return { array: item, nullableItems };
}

function validateSha256(value: string): void {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new ReplayValidationError('sha256 must be a lowercase SHA-256 hash.');
  }
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ReplayValidationError(`${field} must be a string of at most ${maxLength} characters.`);
  }
  return value;
}

function optionalEnum(value: unknown, values: string[], field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new ReplayValidationError(`${field} must be one of ${values.join(', ')}.`);
  }
  return value;
}

function parsePage(value: unknown, fallback: number, field: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ReplayValidationError(`${field} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
