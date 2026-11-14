import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  MatchIngestion,
  MatchPlayerIngestion,
  ReplayFile,
  ReplayFileRegistration,
  ReplayIngestionRequest,
  ReplayProcessingAttempt,
} from '../../generated/v1/models';
import { ReplayValidationError } from './replays.errors';
import { ReplaysRepository } from './replays.repository';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EPIC_ID_PATTERN = /^[a-f0-9]{32}$/;

@Injectable()
export class ReplaysService {
  constructor(private readonly repository: ReplaysRepository) {}

  async listFiles(sha256?: string, matchId?: number | string): Promise<ReplayFile[]> {
    if (sha256 !== undefined && !SHA256_PATTERN.test(sha256)) {
      throw new ReplayValidationError('sha256 must be a lowercase SHA-256 hash.');
    }
    let parsedMatchId: number | undefined;
    if (matchId !== undefined) {
      if (typeof matchId === 'string' && !/^-?\d+$/.test(matchId)) {
        throw new ReplayValidationError('matchId must be an integer.');
      }
      parsedMatchId = typeof matchId === 'number' ? matchId : Number(matchId);
      if (!Number.isSafeInteger(parsedMatchId)) {
        throw new ReplayValidationError('matchId must be a safe integer.');
      }
    }
    return this.repository.listFiles(sha256, parsedMatchId);
  }

  async getFile(sha256: string): Promise<ReplayFile> {
    if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
      throw new ReplayValidationError('sha256 must be a lowercase SHA-256 hash.');
    }
    return this.repository.getFile(sha256);
  }

  async listAttempts(sha256: string): Promise<ReplayProcessingAttempt[]> {
    if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
      throw new ReplayValidationError('sha256 must be a lowercase SHA-256 hash.');
    }
    return this.repository.listAttempts(sha256);
  }

  async registerFile(input: ReplayFileRegistration) {
    if (
      !input
      || typeof input.fileSha256 !== 'string'
      || !SHA256_PATTERN.test(input.fileSha256)
    ) {
      throw new ReplayValidationError('fileSha256 must be a lowercase SHA-256 hash.');
    }
    assertAllowedProperties(input, [
      'fileSha256',
      'fileName',
      'fileSizeBytes',
      'fileCreatedAt',
    ], 'replay file registration');

    if (typeof input.fileName !== 'string' || input.fileName.length > 255) {
      throw new ReplayValidationError('fileName must be at most 255 characters.');
    }

    if (
      input.fileSizeBytes !== undefined
      && input.fileSizeBytes !== null
      && (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes < 0)
    ) {
      throw new ReplayValidationError('fileSizeBytes must be a non-negative safe integer.');
    }

    if (
      input.fileCreatedAt !== undefined
      && input.fileCreatedAt !== null
      && !isValidDate(input.fileCreatedAt)
    ) {
      throw new ReplayValidationError('fileCreatedAt must be a valid date-time.');
    }

    return this.repository.registerFile(input);
  }

  async ingest(fileSha256: string, input: ReplayIngestionRequest) {
    if (typeof fileSha256 !== 'string' || !SHA256_PATTERN.test(fileSha256)) {
      throw new ReplayValidationError('sha256 must be a lowercase SHA-256 hash.');
    }

    validateIngestion(input);
    const requestSha256 = createHash('sha256')
      .update(stableSerialize(canonicalizeRequest(input)))
      .digest('hex');

    return this.repository.ingest(fileSha256, input, requestSha256);
  }
}

function validateIngestion(input: ReplayIngestionRequest): void {
  if (
    !input
    || typeof input !== 'object'
    || typeof input.idempotencyKey !== 'string'
    || !input.idempotencyKey
    || input.idempotencyKey.length > 100
  ) {
    throw new ReplayValidationError('idempotencyKey is required and must be at most 100 characters.');
  }
  assertAllowedProperties(input, [
    'idempotencyKey',
    'analyzerVersion',
    'match',
    'matchPlayers',
    'matchStats',
    'containers',
    'rewards',
    'vehicleUsages',
    'pois',
    'poiVisits',
    'safeZonePhases',
  ], 'request');

  validateAnalyzerVersion(input.analyzerVersion);
  validateMatch(input.match);

  const players = requireArray(input.matchPlayers, 'matchPlayers');
  for (const player of players) {
    if (!player || typeof player !== 'object') {
      throw new ReplayValidationError('matchPlayers must contain participant objects.');
    }
    validateMatchPlayer(player);
  }
  assertUnique(players.map((player) => player.sourcePlayerKey), 'sourcePlayerKey');
  const sourcePlayerKeys = new Set(players.map((player) => player.sourcePlayerKey));
  const playerIdentities = new Set<string>();

  for (const player of players) {
    const hasBotId = player.botId !== undefined && player.botId !== null;
    if (player.epicId !== undefined && player.epicId !== null && hasBotId) {
      throw new ReplayValidationError('A match participant cannot have both epicId and botId.');
    }
    if (
      hasBotId
      && player.playerType !== 'bot'
      && player.playerType !== 'named_bot'
    ) {
      throw new ReplayValidationError('botId can only be supplied for a bot participant.');
    }

    const identity = player.epicId
      ? `epic:${player.epicId}`
      : hasBotId
        ? `bot:${player.botId}`
        : undefined;
    if (identity && playerIdentities.has(identity)) {
      throw new ReplayValidationError('A global player identity can appear only once in a match.');
    }
    if (identity) playerIdentities.add(identity);
  }

  if (
    input.matchStats !== undefined
    && (input.matchStats === null || typeof input.matchStats !== 'object' || Array.isArray(input.matchStats))
  ) {
    throw new ReplayValidationError('matchStats must be an object.');
  }
  if (input.matchStats) {
    assertAllowedProperties(input.matchStats, [
      'sourcePlayerKey',
      'totalTraveled',
      'accuracy',
      'unknown',
      'assists',
      'eliminations',
      'weaponDamage',
      'otherDamage',
      'revives',
      'damageTaken',
      'damageToStructures',
      'materialsGathered',
      'materialsUsed',
    ], 'matchStats');
  }
  if (
    input.matchStats?.sourcePlayerKey !== undefined
    && input.matchStats.sourcePlayerKey !== null
    && (
      typeof input.matchStats.sourcePlayerKey !== 'string'
      || !sourcePlayerKeys.has(input.matchStats.sourcePlayerKey)
    )
  ) {
    throw new ReplayValidationError('matchStats.sourcePlayerKey must refer to a participant in matchPlayers.');
  }
  if (input.matchStats?.totalTraveled !== undefined && input.matchStats.totalTraveled !== null) {
    assertNonNegative(input.matchStats.totalTraveled, 'matchStats.totalTraveled');
  }
  if (input.matchStats?.accuracy !== undefined && input.matchStats.accuracy !== null) {
    assertNonNegative(input.matchStats.accuracy, 'matchStats.accuracy');
  }
  if (input.matchStats) {
    for (const field of [
      'unknown',
      'assists',
      'eliminations',
      'weaponDamage',
      'otherDamage',
      'revives',
      'damageTaken',
      'damageToStructures',
      'materialsGathered',
      'materialsUsed',
    ] as const) {
      const value = input.matchStats[field];
      if (value !== undefined && value !== null) assertInt32(value, `matchStats.${field}`);
    }
  }

  const containers = optionalArray(input.containers, 'containers');
  for (const container of containers) {
    if (!container || typeof container !== 'object') {
      throw new ReplayValidationError('containers must contain container objects.');
    }
    assertAllowedProperties(container, [
      'sourceId',
      'containerKind',
      'blueprint',
      'replayActorId',
      'locationX',
      'locationY',
      'locationZ',
      'firstSeenSeconds',
      'interactions',
    ], 'container');
  }
  assertUnique(containers.map((container) => container.sourceId), 'container sourceId');

  const interactionSourceIds = new Set<string>();
  for (const container of containers) {
    if (
      typeof container.sourceId !== 'string'
      || !container.sourceId
      || container.sourceId.length > 200
      || typeof container.containerKind !== 'string'
      || container.containerKind.length > 80
    ) {
      throw new ReplayValidationError('Each container requires a sourceId and containerKind.');
    }
    assertOptionalString(container.blueprint, 255, 'container blueprint');
    assertOptionalString(container.replayActorId, 200, 'container replayActorId');
    for (const [field, value] of [
      ['locationX', container.locationX],
      ['locationY', container.locationY],
      ['locationZ', container.locationZ],
    ] as const) {
      if (value !== undefined && value !== null) assertFiniteNumber(value, `container ${field}`);
    }
    if (container.firstSeenSeconds !== undefined && container.firstSeenSeconds !== null) {
      assertNonNegative(container.firstSeenSeconds, 'container firstSeenSeconds');
    }
    for (const interaction of optionalArray(container.interactions, 'container interactions')) {
      if (!interaction || typeof interaction !== 'object') {
        throw new ReplayValidationError('Container interactions must contain interaction objects.');
      }
      assertAllowedProperties(interaction, [
        'sourceId',
        'sourcePlayerKey',
        'eventTimeSeconds',
        'isRefillReopen',
        'interactionType',
        'sourceConfidence',
      ], 'container interaction');
      if (typeof interaction.sourceId !== 'string'
        || !interaction.sourceId
        || interaction.sourceId.length > 200) {
        throw new ReplayValidationError('Each container interaction requires a sourceId.');
      }
      if (interactionSourceIds.has(interaction.sourceId)) {
        throw new ReplayValidationError('Container interaction sourceIds must be unique within a Replay file.');
      }
      interactionSourceIds.add(interaction.sourceId);
      if (
        interaction.sourcePlayerKey !== undefined
        && interaction.sourcePlayerKey !== null
        && (
          typeof interaction.sourcePlayerKey !== 'string'
          || !sourcePlayerKeys.has(interaction.sourcePlayerKey)
        )
      ) {
        throw new ReplayValidationError('Container interactions must reference a participant in matchPlayers.');
      }
      assertNonNegative(interaction.eventTimeSeconds, 'container interaction eventTimeSeconds');
      if (
        interaction.interactionType !== 'opened'
        && interaction.interactionType !== 'destroyed'
        && interaction.interactionType !== 'searched'
        && interaction.interactionType !== 'unknown'
      ) {
        throw new ReplayValidationError('Container interactionType is invalid.');
      }
      if (typeof interaction.isRefillReopen !== 'boolean') {
        throw new ReplayValidationError('isRefillReopen must be a boolean.');
      }
      assertOptionalString(interaction.sourceConfidence, 20, 'interaction sourceConfidence');
    }
  }

  const rewards = optionalArray(input.rewards, 'rewards');
  for (const reward of rewards) {
    if (!reward || typeof reward !== 'object') {
      throw new ReplayValidationError('rewards must contain reward objects.');
    }
    assertAllowedProperties(reward, [
      'sourceId',
      'prizeId',
      'rewardTypeCode',
      'category',
      'displayName',
      'sourcePlayerKey',
      'containerInteractionSourceId',
      'eventTimeSeconds',
      'isGoldenChest',
      'isTeammateReward',
      'isFromChest',
      'wasDestroyed',
      'origin',
      'sourceConfidence',
    ], 'reward');
  }
  assertUnique(rewards.map((reward) => reward.sourceId), 'reward sourceId');
  for (const reward of rewards) {
    if (
      typeof reward.sourceId !== 'string'
      || !reward.sourceId
      || reward.sourceId.length > 200
      || typeof reward.prizeId !== 'string'
      || !reward.prizeId
      || reward.prizeId.length > 150
    ) {
      throw new ReplayValidationError('Each reward requires a sourceId and prizeId.');
    }
    if (typeof reward.isTeammateReward !== 'boolean') {
      throw new ReplayValidationError('isTeammateReward must be a boolean.');
    }
    assertOptionalString(reward.rewardTypeCode, 150, 'rewardTypeCode');
    assertOptionalString(reward.category, 80, 'reward category');
    assertOptionalString(reward.displayName, 150, 'reward displayName');
    assertOptionalString(reward.origin, 50, 'reward origin');
    assertOptionalString(reward.sourceConfidence, 20, 'reward sourceConfidence');
    assertOptionalBoolean(reward.isGoldenChest, 'reward.isGoldenChest');
    assertOptionalBoolean(reward.isFromChest, 'reward.isFromChest');
    assertOptionalBoolean(reward.wasDestroyed, 'reward.wasDestroyed');
    if (
      reward.sourcePlayerKey !== undefined
      && reward.sourcePlayerKey !== null
      && (
        typeof reward.sourcePlayerKey !== 'string'
        || !sourcePlayerKeys.has(reward.sourcePlayerKey)
      )
    ) {
      throw new ReplayValidationError('Rewards must reference a participant in matchPlayers.');
    }
    if (
      reward.containerInteractionSourceId !== undefined
      && reward.containerInteractionSourceId !== null
      && (
        typeof reward.containerInteractionSourceId !== 'string'
        || !interactionSourceIds.has(reward.containerInteractionSourceId)
      )
    ) {
      throw new ReplayValidationError('Rewards must reference an observed container interaction.');
    }
    if (reward.eventTimeSeconds !== undefined && reward.eventTimeSeconds !== null) {
      assertNonNegative(reward.eventTimeSeconds, 'reward eventTimeSeconds');
    }
  }

  const vehicleUsages = optionalArray(input.vehicleUsages, 'vehicleUsages');
  for (const usage of vehicleUsages) {
    if (!usage || typeof usage !== 'object') {
      throw new ReplayValidationError('vehicleUsages must contain usage objects.');
    }
    assertAllowedProperties(usage, [
      'sourceId',
      'sourcePlayerKey',
      'vehicleCode',
      'displayName',
      'vehicleClass',
      'replayVehicleId',
      'enteredAtSeconds',
      'exitedAtSeconds',
    ], 'vehicle usage');
  }
  assertUnique(vehicleUsages.map((usage) => usage.sourceId), 'vehicle usage sourceId');
  for (const usage of vehicleUsages) {
    if (
      typeof usage.sourceId !== 'string'
      || !usage.sourceId
      || typeof usage.vehicleCode !== 'string'
      || usage.vehicleCode.length > 150
    ) {
      throw new ReplayValidationError('Each vehicle usage requires a sourceId and vehicleCode.');
    }
    if (usage.sourceId.length > 200) {
      throw new ReplayValidationError('vehicle usage sourceId must be at most 200 characters.');
    }
    assertOptionalString(usage.displayName, 150, 'vehicle displayName');
    assertOptionalString(usage.vehicleClass, 80, 'vehicleClass');
    assertOptionalString(usage.replayVehicleId, 200, 'replayVehicleId');
    if (!sourcePlayerKeys.has(usage.sourcePlayerKey)) {
      throw new ReplayValidationError('Vehicle usages must reference a participant in matchPlayers.');
    }
    if (usage.enteredAtSeconds !== undefined && usage.enteredAtSeconds !== null) {
      assertNonNegative(usage.enteredAtSeconds, 'vehicle enteredAtSeconds');
    }
    if (usage.exitedAtSeconds !== undefined && usage.exitedAtSeconds !== null) {
      assertNonNegative(usage.exitedAtSeconds, 'vehicle exitedAtSeconds');
    }
    if (
      usage.enteredAtSeconds !== undefined
      && usage.enteredAtSeconds !== null
      && usage.exitedAtSeconds !== undefined
      && usage.exitedAtSeconds !== null
      && usage.exitedAtSeconds < usage.enteredAtSeconds
    ) {
      throw new ReplayValidationError('Vehicle exit time cannot precede entry time.');
    }
  }

  const pois = optionalArray(input.pois, 'pois');
  for (const poi of pois) {
    if (!poi || typeof poi !== 'object') {
      throw new ReplayValidationError('pois must contain POI objects.');
    }
    assertAllowedProperties(poi, [
      'mapCode',
      'seasonCode',
      'poiCode',
      'displayName',
      'centerX',
      'centerY',
      'centerZ',
      'boundaryRadius',
      'coordinateSystem',
    ], 'POI');
  }
  const poiKeys = pois.map((poi) => `${poi.mapCode}\u0000${poi.seasonCode ?? ''}\u0000${poi.poiCode}`);
  assertUnique(poiKeys, 'POI map/season/code');
  for (const poi of pois) {
    if (
      typeof poi.mapCode !== 'string'
      || poi.mapCode.length > 100
      || typeof poi.poiCode !== 'string'
      || poi.poiCode.length > 150
      || typeof poi.displayName !== 'string'
      || poi.displayName.length > 150
    ) {
      throw new ReplayValidationError('Each POI requires mapCode, poiCode, and displayName.');
    }
    assertOptionalString(poi.seasonCode, 80, 'POI seasonCode');
    assertOptionalString(poi.coordinateSystem, 100, 'POI coordinateSystem');
    if (poi.boundaryRadius !== undefined && poi.boundaryRadius !== null) {
      assertNonNegative(poi.boundaryRadius, 'POI boundaryRadius');
    }
    for (const [field, value] of [
      ['centerX', poi.centerX],
      ['centerY', poi.centerY],
      ['centerZ', poi.centerZ],
    ] as const) {
      if (value !== undefined && value !== null) assertFiniteNumber(value, `POI ${field}`);
    }
  }

  const poiVisits = optionalArray(input.poiVisits, 'poiVisits');
  for (const visit of poiVisits) {
    if (!visit || typeof visit !== 'object') {
      throw new ReplayValidationError('poiVisits must contain visit objects.');
    }
    assertAllowedProperties(visit, [
      'sourceId',
      'sourcePlayerKey',
      'poiCode',
      'seasonCode',
      'startedAtSeconds',
      'endedAtSeconds',
      'durationSeconds',
      'confidence',
      'sampleCount',
      'detectionMethod',
    ], 'POI visit');
  }
  assertUnique(poiVisits.map((visit) => visit.sourceId), 'POI visit sourceId');
  if (
    poiVisits.length > 0
    && (input.match.mapCode === undefined || input.match.mapCode === null)
  ) {
    throw new ReplayValidationError('match.mapCode is required when POI visits are included.');
  }
  for (const visit of poiVisits) {
    if (!sourcePlayerKeys.has(visit.sourcePlayerKey)) {
      throw new ReplayValidationError('POI visits must reference a participant in matchPlayers.');
    }
    if (
      typeof visit.sourceId !== 'string'
      || !visit.sourceId
      || visit.sourceId.length > 200
      || typeof visit.poiCode !== 'string'
      || !visit.poiCode
      || visit.poiCode.length > 150
    ) {
      throw new ReplayValidationError('Each POI visit requires a sourceId and poiCode.');
    }
    assertOptionalString(visit.seasonCode, 80, 'POI visit seasonCode');
    assertNonNegative(visit.startedAtSeconds, 'POI visit startedAtSeconds');
    assertNonNegative(visit.endedAtSeconds, 'POI visit endedAtSeconds');
    assertNonNegative(visit.durationSeconds, 'POI visit durationSeconds');
    if (visit.endedAtSeconds < visit.startedAtSeconds) {
      throw new ReplayValidationError('POI visit end time cannot precede its start time.');
    }
    if (
      visit.confidence !== undefined
      && visit.confidence !== null
      && (!Number.isFinite(visit.confidence) || visit.confidence < 0 || visit.confidence > 1)
    ) {
      throw new ReplayValidationError('POI visit confidence must be between 0 and 1.');
    }
    if (visit.sampleCount !== undefined && visit.sampleCount !== null) {
      assertOptionalInteger(visit.sampleCount, 0, 2147483647, 'POI visit sampleCount');
    }
    assertOptionalString(visit.detectionMethod, 50, 'POI visit detectionMethod');
  }

  const phases = optionalArray(input.safeZonePhases, 'safeZonePhases');
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object') {
      throw new ReplayValidationError('safeZonePhases must contain phase objects.');
    }
    assertAllowedProperties(phase, [
      'phaseNumber',
      'startsAtSeconds',
      'endsAtSeconds',
      'centerX',
      'centerY',
      'radius',
    ], 'Safe Zone phase');
  }
  assertUnique(phases.map((phase) => String(phase.phaseNumber)), 'Safe Zone phaseNumber');
  for (const phase of phases) {
    if (!Number.isInteger(phase.phaseNumber) || phase.phaseNumber < 1 || phase.phaseNumber > 2147483647) {
      throw new ReplayValidationError('Safe Zone phaseNumber must be a positive 32-bit integer.');
    }
    if (phase.startsAtSeconds !== undefined && phase.startsAtSeconds !== null) {
      assertNonNegative(phase.startsAtSeconds, 'Safe Zone startsAtSeconds');
    }
    if (phase.endsAtSeconds !== undefined && phase.endsAtSeconds !== null) {
      assertNonNegative(phase.endsAtSeconds, 'Safe Zone endsAtSeconds');
    }
    if (phase.radius !== undefined && phase.radius !== null) {
      assertNonNegative(phase.radius, 'Safe Zone radius');
    }
    if (
      phase.startsAtSeconds !== undefined
      && phase.startsAtSeconds !== null
      && phase.endsAtSeconds !== undefined
      && phase.endsAtSeconds !== null
      && phase.endsAtSeconds < phase.startsAtSeconds
    ) {
      throw new ReplayValidationError('Safe Zone phase end time cannot precede its start time.');
    }
    for (const [field, value] of [
      ['centerX', phase.centerX],
      ['centerY', phase.centerY],
    ] as const) {
      if (value !== undefined && value !== null) assertFiniteNumber(value, `Safe Zone ${field}`);
    }
  }
}

function validateAnalyzerVersion(
  analyzerVersion: ReplayIngestionRequest['analyzerVersion'],
): void {
  if (
    !analyzerVersion
    || typeof analyzerVersion !== 'object'
    || Array.isArray(analyzerVersion)
    || typeof analyzerVersion.applicationVersion !== 'string'
    || analyzerVersion.applicationVersion.length > 50
    || typeof analyzerVersion.analyzerVersion !== 'string'
    || analyzerVersion.analyzerVersion.length > 50
    || typeof analyzerVersion.parserName !== 'string'
    || analyzerVersion.parserName.length > 100
    || typeof analyzerVersion.parserVersion !== 'string'
    || analyzerVersion.parserVersion.length > 100
  ) {
    throw new ReplayValidationError('Analyzer version fields are required and must fit the schema limits.');
  }
  assertAllowedProperties(analyzerVersion, [
    'applicationVersion',
    'analyzerVersion',
    'parserName',
    'parserVersion',
    'description',
  ], 'analyzerVersion');
  assertOptionalString(analyzerVersion.description, undefined, 'analyzerVersion.description');
}

function validateMatch(match: MatchIngestion): void {
  if (
    !match
    || typeof match !== 'object'
    || Array.isArray(match)
    || typeof match.matchKey !== 'string'
    || !match.matchKey
    || match.matchKey.length > 200
  ) {
    throw new ReplayValidationError('match.matchKey is required and must be at most 200 characters.');
  }
  assertAllowedProperties(match, [
    'matchKey',
    'matchStartAt',
    'matchEndAt',
    'durationSeconds',
    'totalPlayers',
    'totalTeams',
    'chapterNumber',
    'isCustomMatch',
    'sessionId',
    'playlist',
    'gameMode',
    'mapCode',
    'mapName',
    'seasonCode',
    'gameVersion',
  ], 'match');
  if (
    match.matchStartAt !== undefined
    && match.matchStartAt !== null
    && !isValidDate(match.matchStartAt)
  ) {
    throw new ReplayValidationError('match.matchStartAt must be a valid date-time.');
  }
  if (
    match.matchEndAt !== undefined
    && match.matchEndAt !== null
    && !isValidDate(match.matchEndAt)
  ) {
    throw new ReplayValidationError('match.matchEndAt must be a valid date-time.');
  }
  if (
    match.matchStartAt !== undefined
    && match.matchStartAt !== null
    && match.matchEndAt !== undefined
    && match.matchEndAt !== null
    && Date.parse(match.matchEndAt) < Date.parse(match.matchStartAt)
  ) {
    throw new ReplayValidationError('Match end time cannot precede its start time.');
  }
  if (match.durationSeconds !== undefined && match.durationSeconds !== null) {
    assertNonNegative(match.durationSeconds, 'match.durationSeconds');
  }
  assertOptionalBoolean(match.isCustomMatch, 'match.isCustomMatch');
  assertOptionalString(match.sessionId, 150, 'match.sessionId');
  assertOptionalString(match.playlist, 150, 'match.playlist');
  assertOptionalString(match.gameMode, 100, 'match.gameMode');
  assertOptionalString(match.mapCode, 100, 'match.mapCode');
  assertOptionalString(match.mapName, 150, 'match.mapName');
  assertOptionalString(match.seasonCode, 80, 'match.seasonCode');
  assertOptionalString(match.gameVersion, 80, 'match.gameVersion');
  assertOptionalInteger(match.totalPlayers, 0, 2147483647, 'match.totalPlayers');
  assertOptionalInteger(match.totalTeams, 0, 2147483647, 'match.totalTeams');
  assertOptionalInteger(match.chapterNumber, -2147483648, 2147483647, 'match.chapterNumber');
}

function validateMatchPlayer(player: MatchPlayerIngestion): void {
  if (
    typeof player.sourcePlayerKey !== 'string'
    || !player.sourcePlayerKey
    || player.sourcePlayerKey.length > 200
  ) {
    throw new ReplayValidationError('Each match player requires a sourcePlayerKey.');
  }
  assertAllowedProperties(player, [
    'sourcePlayerKey',
    'playerType',
    'epicId',
    'botId',
    'platformUniqueNetId',
    'currentDisplayName',
    'platform',
    'totalTraveled',
    'deathTimeSeconds',
    'teamIndex',
    'playerNumber',
    'placement',
    'kills',
    'teamKills',
    'assists',
    'weaponDamage',
    'otherDamage',
    'revives',
    'damageTaken',
    'damageToStructures',
    'materialsGathered',
    'materialsUsed',
    'deathCause',
    'deathCircumstance',
    'level',
    'seasonLevel',
    'isReplayOwner',
    'isGameSessionOwner',
    'isPartyLeader',
    'isAnonymous',
    'hasFinishedLoading',
    'hasStartedPlaying',
    'replayPlayerId',
    'cosmetics',
  ], 'match player');
  if (player.playerType !== 'player' && player.playerType !== 'bot'
    && player.playerType !== 'named_bot' && player.playerType !== 'unknown') {
    throw new ReplayValidationError('playerType is invalid.');
  }
  if (
    player.epicId !== undefined
    && player.epicId !== null
    && (typeof player.epicId !== 'string' || !EPIC_ID_PATTERN.test(player.epicId))
  ) {
    throw new ReplayValidationError('epicId must be a lowercase 32-character hexadecimal ID.');
  }
  if (player.botId !== undefined && player.botId !== null
    && (typeof player.botId !== 'string' || player.botId.length > 200)) {
    throw new ReplayValidationError('botId must be at most 200 characters.');
  }
  for (const [field, value] of [
    ['isReplayOwner', player.isReplayOwner],
    ['isGameSessionOwner', player.isGameSessionOwner],
    ['isPartyLeader', player.isPartyLeader],
    ['isAnonymous', player.isAnonymous],
    ['hasFinishedLoading', player.hasFinishedLoading],
    ['hasStartedPlaying', player.hasStartedPlaying],
  ] as const) {
    assertOptionalBoolean(value, `matchPlayers.${field}`);
  }
  assertOptionalString(player.currentDisplayName, 150, 'currentDisplayName');
  assertOptionalString(player.platformUniqueNetId, 150, 'platformUniqueNetId');
  assertOptionalString(player.platform, 80, 'platform');
  assertOptionalString(player.replayPlayerId, 200, 'replayPlayerId');
  if (player.totalTraveled !== undefined && player.totalTraveled !== null) {
    assertNonNegative(player.totalTraveled, 'match player totalTraveled');
  }
  if (player.deathTimeSeconds !== undefined && player.deathTimeSeconds !== null) {
    assertNonNegative(player.deathTimeSeconds, 'match player deathTimeSeconds');
  }
  for (const [field, value] of Object.entries(player)) {
    if (
      ['teamIndex', 'playerNumber', 'placement', 'kills', 'teamKills', 'assists',
        'weaponDamage', 'otherDamage', 'revives', 'damageTaken', 'damageToStructures',
        'materialsGathered', 'materialsUsed', 'deathCause', 'deathCircumstance',
        'level', 'seasonLevel'].includes(field)
      && value !== undefined
      && value !== null
    ) {
      assertInt32(value, field);
    }
  }
  if (
    player.cosmetics !== undefined
    && (player.cosmetics === null || typeof player.cosmetics !== 'object' || Array.isArray(player.cosmetics))
  ) {
    throw new ReplayValidationError('cosmetics must be a JSON object.');
  }
}

function assertUnique(values: string[], label: string): void {
  const unique = new Set(values);
  if (unique.size !== values.length) {
    throw new ReplayValidationError(`${label} values must be unique within the request.`);
  }
}

function assertAllowedProperties(value: object, allowed: string[], label: string): void {
  const allowedProperties = new Set(allowed);
  const unknownProperty = Object.keys(value).find((key) => !allowedProperties.has(key));
  if (unknownProperty !== undefined) {
    throw new ReplayValidationError(`${label}.${unknownProperty} is not allowed.`);
  }
}

function requireArray<T>(value: T[] | undefined, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new ReplayValidationError(`${label} must be an array.`);
  }
  return value;
}

function optionalArray<T>(value: T[] | undefined, label: string): T[] {
  if (value === undefined) return [];
  return requireArray(value, label);
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ReplayValidationError(`${label} must be a finite non-negative number.`);
  }
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new ReplayValidationError(`${label} must be a finite number.`);
  }
}

function assertOptionalString(
  value: string | null | undefined,
  maxLength: number | undefined,
  label: string,
): void {
  if (
    value !== undefined
    && value !== null
    && (
      typeof value !== 'string'
      || (maxLength !== undefined && value.length > maxLength)
    )
  ) {
    const limit = maxLength === undefined ? '' : ` at most ${maxLength} characters`;
    throw new ReplayValidationError(`${label} must be a string${limit}.`);
  }
}

function assertOptionalBoolean(value: boolean | null | undefined, label: string): void {
  if (value !== undefined && value !== null && typeof value !== 'boolean') {
    throw new ReplayValidationError(`${label} must be a boolean.`);
  }
}

function assertOptionalInteger(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (
    value !== undefined
    && value !== null
    && (!Number.isInteger(value) || value < minimum || value > maximum)
  ) {
    throw new ReplayValidationError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function assertInt32(value: unknown, label: string): void {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < -2147483648
    || value > 2147483647
  ) {
    throw new ReplayValidationError(`${label} must be a 32-bit integer.`);
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6]);
  const offsetHours = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinutes = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];

  return month >= 1
    && month <= 12
    && day >= 1
    && day <= (daysInMonth ?? 0)
    && hours <= 23
    && minutes <= 59
    && seconds <= 59
    && offsetHours <= 23
    && offsetMinutes <= 59
    && Number.isFinite(Date.parse(value));
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function canonicalizeRequest(input: ReplayIngestionRequest): ReplayIngestionRequest {
  return {
    ...input,
    matchPlayers: [...input.matchPlayers].sort((left, right) => (
      left.sourcePlayerKey.localeCompare(right.sourcePlayerKey)
    )),
    containers: input.containers?.map((container) => ({
      ...container,
      interactions: container.interactions
        ? [...container.interactions].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
        : undefined,
    })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    rewards: input.rewards
      ? [...input.rewards].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
      : undefined,
    vehicleUsages: input.vehicleUsages
      ? [...input.vehicleUsages].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
      : undefined,
    pois: input.pois
      ? [...input.pois].sort((left, right) => (
        `${left.mapCode}\u0000${left.seasonCode ?? ''}\u0000${left.poiCode}`.localeCompare(
          `${right.mapCode}\u0000${right.seasonCode ?? ''}\u0000${right.poiCode}`,
        )
      ))
      : undefined,
    poiVisits: input.poiVisits
      ? [...input.poiVisits].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
      : undefined,
    safeZonePhases: input.safeZonePhases
      ? [...input.safeZonePhases].sort((left, right) => left.phaseNumber - right.phaseNumber)
      : undefined,
  };
}
