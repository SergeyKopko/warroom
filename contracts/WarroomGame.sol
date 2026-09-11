// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPonsV2FeeEscrow {
    function balanceOfToken(address recipient, address token) external view returns (uint256);
    function claimToken(address token) external;
}

/// @title WARROOM
/// @notice Commander NFT, battle state, WAR sinks and PLTR reward rounds.
/// @dev Progress is stored by tokenId and intentionally survives transfers.
contract WarroomGame is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant maxSupply = 1_200;
    uint256 public constant MINT_PRICE = 100_000 ether;
    uint256 public constant EXTRA_SHOT_PRICE = 10_000 ether;
    uint256 public constant GENERAL_TRIAL_PRICE = 800_000 ether;
    uint256 public constant TARGET_MAX_HP = 100_000_000;
    uint256 public constant ROUND_DURATION = 5 hours;
    uint256 public constant FREE_SHOT_COOLDOWN = 4 hours;
    uint256 public constant BPS = 10_000;
    uint256 public constant CLOSER_FEE_BPS = 50; // 0.5%
    uint256 public constant BURN_BPS = 5_000; // 50%
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable war;
    IERC20 public immutable pltr;
    IPonsV2FeeEscrow public immutable ponsFeeEscrow;
    address public immutable treasury;

    struct Commander {
        uint8 rank;
        uint8 missileLevel;
        uint32 hits;
        uint32 launches;
        uint64 mintedAt;
        uint64 lastLaunchAt;
        uint32 extraDay;
        uint8 extraCount;
        uint32 activeRound;
        uint256 totalDamage;
        uint256 warSpent;
        uint256 warBurned;
    }

    struct RoundResult {
        uint128 reward;
        uint128 totalWeight;
        uint64 closedAt;
    }

    mapping(uint256 => Commander) private commanders;
    mapping(uint256 => RoundResult) public rounds;
    mapping(uint256 => mapping(uint256 => uint256)) public roundWeightOf;
    mapping(uint256 => mapping(uint256 => bool)) public rewardClaimed;
    mapping(uint8 => uint256) public rankPopulation;

    uint256 public targetHp = TARGET_MAX_HP;
    uint256 public targetCycle = 1;
    uint256 public totalWarBurned;
    uint256 public totalLaunches;
    uint256 public currentRoundId = 1;
    uint256 public currentRoundEndsAt;
    uint256 public currentRoundWeight;
    uint256 public reservedRewards;
    string private baseTokenURI;

    event CommanderMinted(uint256 indexed tokenId, address indexed owner, uint256 paid, uint256 burned);
    event MissileLaunched(uint256 indexed tokenId, address indexed owner, bool paid, bool hit, uint256 damage, uint256 cycle);
    event MissileUpgraded(uint256 indexed tokenId, uint8 level, uint256 paid, uint256 burned);
    event RankUpgraded(uint256 indexed tokenId, uint8 rank, bool purchased, uint256 paid, uint256 burned);
    event TargetDestroyed(uint256 indexed completedCycle, uint256 indexed newCycle);
    event CreatorFeesPulled(uint256 amount);
    event RoundClosed(uint256 indexed roundId, uint256 reward, uint256 totalWeight, address indexed closer, uint256 closerFee);
    event RewardsClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount);
    event BaseURIUpdated(string baseURI);

    error NotTokenOwner();
    error InvalidQuantity();
    error SoldOut();
    error StillReloading();
    error DailyExtraLimit();
    error RequirementsNotMet();
    error RankFull();
    error RoundStillOpen();
    error NothingToClaim();

    constructor(address war_, address pltr_, address treasury_, address ponsFeeEscrow_, address admin_)
        ERC721("WARROOM Commander", "COMMANDER")
        Ownable(admin_)
    {
        require(war_ != address(0) && pltr_ != address(0), "zero token");
        require(treasury_ != address(0) && ponsFeeEscrow_ != address(0), "zero service");
        war = IERC20(war_);
        pltr = IERC20(pltr_);
        treasury = treasury_;
        ponsFeeEscrow = IPonsV2FeeEscrow(ponsFeeEscrow_);
        currentRoundEndsAt = block.timestamp + ROUND_DURATION;
    }

    function getCommander(uint256 tokenId) external view returns (Commander memory) {
        _requireOwned(tokenId);
        return commanders[tokenId];
    }

    function setBaseURI(string calldata nextBaseURI) external onlyOwner {
        baseTokenURI = nextBaseURI;
        emit BaseURIUpdated(nextBaseURI);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function ownedTokens(address holder) external view returns (uint256[] memory tokenIds) {
        uint256 count = balanceOf(holder);
        tokenIds = new uint256[](count);
        for (uint256 i; i < count; ++i) tokenIds[i] = tokenOfOwnerByIndex(holder, i);
    }

    function mint(uint256 quantity) external nonReentrant {
        if (quantity == 0 || quantity > 25) revert InvalidQuantity();
        uint256 supply = totalSupply();
        if (supply + quantity > maxSupply) revert SoldOut();

        uint256 cost = MINT_PRICE * quantity;
        uint256 burned = _spendWar(msg.sender, cost);
        for (uint256 i; i < quantity; ++i) {
            uint256 tokenId = supply + i + 1;
            commanders[tokenId] = Commander({
                rank: 0,
                missileLevel: 1,
                hits: 0,
                launches: 0,
                mintedAt: uint64(block.timestamp),
                lastLaunchAt: 0,
                extraDay: 0,
                extraCount: 0,
                activeRound: 0,
                totalDamage: 0,
                warSpent: MINT_PRICE,
                warBurned: MINT_PRICE / 2
            });
            rankPopulation[0] += 1;
            _safeMint(msg.sender, tokenId);
            emit CommanderMinted(tokenId, msg.sender, MINT_PRICE, MINT_PRICE / 2);
        }
        assert(burned == cost / 2);
    }

    function launch(uint256 tokenId, bool paid) external nonReentrant {
        _requireTokenOwner(tokenId);
        Commander storage c = commanders[tokenId];

        if (paid) {
            uint32 today = uint32(block.timestamp / 1 days);
            if (c.extraDay != today) {
                c.extraDay = today;
                c.extraCount = 0;
            }
            if (c.extraCount >= 3) revert DailyExtraLimit();
            c.extraCount += 1;
            _spendForCommander(c, EXTRA_SHOT_PRICE);
        } else {
            if (block.timestamp < uint256(c.lastLaunchAt) + FREE_SHOT_COOLDOWN) revert StillReloading();
            c.lastLaunchAt = uint64(block.timestamp);
        }

        if (c.activeRound != currentRoundId) {
            uint256 weight = _rankWeight(c.rank);
            c.activeRound = uint32(currentRoundId);
            roundWeightOf[currentRoundId][tokenId] = weight;
            currentRoundWeight += weight;
        }

        bool hit = uint256(keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), tokenId, c.launches))) % 100 >= 30;
        uint256 damage = hit ? _missileDamage(c.missileLevel) : 0;
        c.launches += 1;
        totalLaunches += 1;
        if (hit) {
            c.hits += 1;
            c.totalDamage += damage;
            if (damage >= targetHp) {
                uint256 completed = targetCycle;
                targetCycle += 1;
                targetHp = TARGET_MAX_HP;
                emit TargetDestroyed(completed, targetCycle);
            } else {
                targetHp -= damage;
            }
        }
        emit MissileLaunched(tokenId, msg.sender, paid, hit, damage, targetCycle);
    }

    function upgradeMissile(uint256 tokenId) external nonReentrant {
        _requireTokenOwner(tokenId);
        Commander storage c = commanders[tokenId];
        uint8 next = c.missileLevel + 1;
        if (next > 4 || c.hits < _missileHits(next)) revert RequirementsNotMet();
        uint256 price = _missilePrice(next);
        _spendForCommander(c, price);
        c.missileLevel = next;
        emit MissileUpgraded(tokenId, next, price, price / 2);
    }

    function buyNextRank(uint256 tokenId) external nonReentrant {
        _requireTokenOwner(tokenId);
        Commander storage c = commanders[tokenId];
        uint8 next = c.rank + 1;
        if (next == 0 || next > 3) revert RequirementsNotMet();
        _checkRankCapacity(next);
        uint256 price = _rankBuyPrice(next);
        _spendForCommander(c, price);
        _setRank(c, next);
        emit RankUpgraded(tokenId, next, true, price, price / 2);
    }

    function promoteWithProgress(uint256 tokenId) external nonReentrant {
        _requireTokenOwner(tokenId);
        Commander storage c = commanders[tokenId];
        uint8 next = c.rank + 1;
        if (next == 0 || next > 3) revert RequirementsNotMet();
        if (c.hits < _rankHits(next) || block.timestamp < uint256(c.mintedAt) + _rankDays(next) * 1 days) {
            revert RequirementsNotMet();
        }
        _checkRankCapacity(next);
        uint256 price = _rankEarnPrice(next);
        _spendForCommander(c, price);
        _setRank(c, next);
        emit RankUpgraded(tokenId, next, false, price, price / 2);
    }

    /// @notice MVP General trial: only a Colonel may enter; a free seat is awarded.
    /// @dev Replace the deterministic admission rule with the final trial/challenge module before mainnet.
    function enterGeneralTrial(uint256 tokenId) external nonReentrant {
        _requireTokenOwner(tokenId);
        Commander storage c = commanders[tokenId];
        if (c.rank != 3) revert RequirementsNotMet();
        _checkRankCapacity(4);
        _spendForCommander(c, GENERAL_TRIAL_PRICE);
        _setRank(c, 4);
        emit RankUpgraded(tokenId, 4, false, GENERAL_TRIAL_PRICE, GENERAL_TRIAL_PRICE / 2);
    }

    function creatorFeesAvailable() public view returns (uint256) {
        return ponsFeeEscrow.balanceOfToken(address(this), address(pltr));
    }

    function pullCreatorFees() public returns (uint256 amount) {
        uint256 beforeBalance = pltr.balanceOf(address(this));
        if (creatorFeesAvailable() > 0) ponsFeeEscrow.claimToken(address(pltr));
        amount = pltr.balanceOf(address(this)) - beforeBalance;
        if (amount > 0) emit CreatorFeesPulled(amount);
    }

    function closeRound() external nonReentrant {
        if (block.timestamp < currentRoundEndsAt) revert RoundStillOpen();
        pullCreatorFees();
        uint256 available = pltr.balanceOf(address(this)) - reservedRewards;
        uint256 closerFee;
        uint256 reward;
        if (currentRoundWeight > 0) {
            closerFee = (available * CLOSER_FEE_BPS) / BPS;
            reward = available - closerFee;
            if (closerFee > 0) pltr.safeTransfer(msg.sender, closerFee);
            reservedRewards += reward;
        }

        rounds[currentRoundId] = RoundResult(uint128(reward), uint128(currentRoundWeight), uint64(block.timestamp));
        emit RoundClosed(currentRoundId, reward, currentRoundWeight, msg.sender, closerFee);

        currentRoundId += 1;
        currentRoundEndsAt = block.timestamp + ROUND_DURATION;
        currentRoundWeight = 0;
    }

    function claimableRewards(uint256 tokenId, uint256[] calldata roundIds) public view returns (uint256 amount) {
        for (uint256 i; i < roundIds.length; ++i) {
            uint256 roundId = roundIds[i];
            if (rewardClaimed[roundId][tokenId]) continue;
            RoundResult memory r = rounds[roundId];
            uint256 weight = roundWeightOf[roundId][tokenId];
            if (r.closedAt > 0 && weight > 0) amount += (uint256(r.reward) * weight) / uint256(r.totalWeight);
        }
    }

    function claimRewards(uint256 tokenId, uint256[] calldata roundIds) external nonReentrant {
        _requireTokenOwner(tokenId);
        uint256 amount;
        for (uint256 i; i < roundIds.length; ++i) {
            uint256 roundId = roundIds[i];
            if (rewardClaimed[roundId][tokenId]) continue;
            RoundResult memory r = rounds[roundId];
            uint256 weight = roundWeightOf[roundId][tokenId];
            if (r.closedAt == 0 || weight == 0) continue;
            rewardClaimed[roundId][tokenId] = true;
            amount += (uint256(r.reward) * weight) / uint256(r.totalWeight);
        }
        if (amount == 0) revert NothingToClaim();
        reservedRewards -= amount;
        pltr.safeTransfer(msg.sender, amount);
        emit RewardsClaimed(tokenId, msg.sender, amount);
    }

    function _spendForCommander(Commander storage c, uint256 amount) internal {
        uint256 burned = _spendWar(msg.sender, amount);
        c.warSpent += amount;
        c.warBurned += burned;
    }

    function _spendWar(address payer, uint256 amount) internal returns (uint256 burned) {
        burned = (amount * BURN_BPS) / BPS;
        war.safeTransferFrom(payer, BURN_ADDRESS, burned);
        war.safeTransferFrom(payer, treasury, amount - burned);
        totalWarBurned += burned;
    }

    function _setRank(Commander storage c, uint8 next) internal {
        rankPopulation[c.rank] -= 1;
        c.rank = next;
        rankPopulation[next] += 1;
    }

    function _checkRankCapacity(uint8 next) internal view {
        uint256 cap = next == 2 ? 100 : next == 3 ? 30 : next == 4 ? 10 : type(uint256).max;
        if (rankPopulation[next] >= cap) revert RankFull();
    }

    function _requireTokenOwner(uint256 tokenId) internal view {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
    }

    function _rankWeight(uint8 rank) internal pure returns (uint256) {
        return rank == 0 ? 100 : rank == 1 ? 140 : rank == 2 ? 190 : rank == 3 ? 250 : 400;
    }

    function _rankHits(uint8 rank) internal pure returns (uint256) {
        return rank == 1 ? 10 : rank == 2 ? 30 : 75;
    }

    function _rankDays(uint8 rank) internal pure returns (uint256) {
        return rank == 1 ? 1 : rank == 2 ? 3 : 7;
    }

    function _rankEarnPrice(uint8 rank) internal pure returns (uint256) {
        return rank == 1 ? 100_000 ether : rank == 2 ? 300_000 ether : 900_000 ether;
    }

    function _rankBuyPrice(uint8 rank) internal pure returns (uint256) {
        return rank == 1 ? 250_000 ether : rank == 2 ? 750_000 ether : 2_250_000 ether;
    }

    function _missileHits(uint8 level) internal pure returns (uint256) {
        return level == 2 ? 10 : level == 3 ? 30 : 75;
    }

    function _missilePrice(uint8 level) internal pure returns (uint256) {
        return level == 2 ? 50_000 ether : level == 3 ? 150_000 ether : 500_000 ether;
    }

    function _missileDamage(uint8 level) internal pure returns (uint256) {
        return level == 1 ? 100 : level == 2 ? 250 : level == 3 ? 600 : 1_500;
    }
}
