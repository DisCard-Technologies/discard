/**
 * Explore Screen
 *
 * Discovery interface for browsing assets the user doesn't own:
 * - Trending Tokens: Popular/top traded tokens from Jupiter
 * - RWA Opportunities: Available RWA tokens with yield info
 * - Open Markets: Active prediction markets from DFlow/Kalshi
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Coins,
  Building2,
  BarChart3,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle,
  Flame,
} from "lucide-react-native";
import { AmbientBackground } from "../../components/ui";

// Hooks
import {
  useTrendingTokens,
  useSearchTrendingTokens,
} from "../../hooks/useTrendingTokens";
import {
  useRwaOpportunities,
  RWA_TYPE_LABELS,
} from "../../hooks/useRwaOpportunities";
import { useOpenMarkets, useSearchMarkets } from "../../hooks/useOpenMarkets";

// Types
import type {
  TrendingToken,
  TrendingCategory,
  TrendingInterval,
  PredictionMarket,
  RwaType,
} from "../../types/holdings.types";

interface ExploreScreenProps {
  navigation: any;
}

type ExploreTab = "tokens" | "rwa" | "markets";

// Format currency
function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(2)}`;
}

// Format percentage
function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// Format price probability (0-1 to percentage)
function formatProbability(price: number): string {
  return `${(price * 100).toFixed(0)}%`;
}

// Trending Token Item Component
function TrendingTokenItem({
  token,
  rank,
  onPress,
}: {
  token: TrendingToken;
  rank: number;
  onPress: () => void;
}) {
  const isPositive = token.change24h >= 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center py-4 px-4 bg-card/50 rounded-xl border border-border/30 mb-3"
      activeOpacity={0.7}
    >
      {/* Rank */}
      <View className="w-8 items-center">
        {rank <= 3 ? (
          <View
            className={`w-6 h-6 rounded-full items-center justify-center ${
              rank === 1
                ? "bg-amber-500/20"
                : rank === 2
                  ? "bg-slate-400/20"
                  : "bg-amber-700/20"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                rank === 1
                  ? "text-amber-500"
                  : rank === 2
                    ? "text-slate-400"
                    : "text-amber-700"
              }`}
            >
              {rank}
            </Text>
          </View>
        ) : (
          <Text className="text-sm text-muted-foreground">{rank}</Text>
        )}
      </View>

      {/* Token Info */}
      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-foreground">
            {token.symbol}
          </Text>
          {token.verified && (
            <CheckCircle
              size={12}
              color="#10B981"
              className="ml-1"
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
        <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
          {token.name}
        </Text>
      </View>

      {/* Price & Change */}
      <View className="items-end">
        <Text className="text-sm font-medium text-foreground">
          {formatCurrency(token.priceUsd)}
        </Text>
        <View className="flex-row items-center mt-1">
          {isPositive ? (
            <TrendingUp size={12} color="#10B981" />
          ) : (
            <TrendingDown size={12} color="#EF4444" />
          )}
          <Text
            className={`text-xs ml-1 ${isPositive ? "text-primary" : "text-destructive"}`}
          >
            {formatPercent(token.change24h)}
          </Text>
        </View>
      </View>

      {/* Volume */}
      <View className="items-end ml-4 min-w-[70px]">
        <Text className="text-[10px] text-muted-foreground uppercase">Vol</Text>
        <Text className="text-xs text-muted-foreground">
          {formatCurrency(token.volume24h)}
        </Text>
      </View>

      <ChevronRight size={16} color="#6B7280" style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );
}

// RWA Opportunity Item Component
function RwaOpportunityItem({
  opportunity,
  onPress,
}: {
  opportunity: {
    mint: string;
    symbol: string;
    description?: string;
    issuer: string;
    type: RwaType;
    expectedYield?: number;
    minInvestment?: number;
  };
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="py-4 px-4 bg-card/50 rounded-xl border border-border/30 mb-3"
      activeOpacity={0.7}
    >
      <View className="flex-row items-start justify-between">
        {/* Token Info */}
        <View className="flex-1">
          <View className="flex-row items-center">
            <Building2 size={16} color="#10B981" />
            <Text className="text-base font-semibold text-foreground ml-2">
              {opportunity.symbol}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground mt-1">
            {opportunity.description || opportunity.symbol}
          </Text>
          <Text className="text-[10px] text-muted-foreground/70 mt-1">
            by {opportunity.issuer}
          </Text>
        </View>

        {/* Yield */}
        {opportunity.expectedYield !== undefined && (
          <View className="items-end">
            <Text className="text-lg font-semibold text-primary">
              {opportunity.expectedYield.toFixed(2)}%
            </Text>
            <Text className="text-[10px] text-muted-foreground uppercase">
              Est. APY
            </Text>
          </View>
        )}
      </View>

      {/* Type Badge */}
      <View className="flex-row items-center mt-3">
        <View className="bg-primary/10 px-2 py-1 rounded-full">
          <Text className="text-[10px] text-primary font-medium">
            {RWA_TYPE_LABELS[opportunity.type] || opportunity.type}
          </Text>
        </View>
        {opportunity.minInvestment !== undefined && (
          <Text className="text-[10px] text-muted-foreground ml-3">
            Min: ${opportunity.minInvestment.toLocaleString()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Open Market Item Component
function OpenMarketItem({
  market,
  onPress,
}: {
  market: PredictionMarket;
  onPress: () => void;
}) {
  const endDate = new Date(market.endDate);
  const now = new Date();
  const daysRemaining = Math.ceil(
    (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isEndingSoon = daysRemaining <= 7;

  return (
    <TouchableOpacity
      onPress={onPress}
      className="py-4 px-4 bg-card/50 rounded-xl border border-border/30 mb-3"
      activeOpacity={0.7}
    >
      {/* Question */}
      <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
        {market.question}
      </Text>

      {/* Category & Time */}
      <View className="flex-row items-center mt-2">
        <View className="bg-accent/10 px-2 py-0.5 rounded-full">
          <Text className="text-[10px] text-accent font-medium">
            {market.category || "General"}
          </Text>
        </View>
        <View className="flex-row items-center ml-3">
          <Clock size={12} color={isEndingSoon ? "#F59E0B" : "#6B7280"} />
          <Text
            className={`text-[10px] ml-1 ${isEndingSoon ? "text-amber-500" : "text-muted-foreground"}`}
          >
            {daysRemaining > 0 ? `${daysRemaining}d left` : "Ending today"}
          </Text>
        </View>
      </View>

      {/* Prices */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-border/20">
        <View className="flex-row items-center">
          <View className="items-center mr-6">
            <Text className="text-xs text-muted-foreground">YES</Text>
            <Text className="text-lg font-semibold text-primary">
              {formatProbability(market.yesPrice)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">NO</Text>
            <Text className="text-lg font-semibold text-destructive">
              {formatProbability(market.noPrice)}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-[10px] text-muted-foreground uppercase">
            24h Volume
          </Text>
          <Text className="text-sm text-foreground">
            {formatCurrency(market.volume24h)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Empty State Component
function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ElementType;
  title: string;
  message: string;
}) {
  return (
    <View className="items-center justify-center py-12 px-6">
      <View className="w-16 h-16 rounded-full bg-card/50 items-center justify-center mb-4">
        <Icon size={32} color="#6B7280" />
      </View>
      <Text className="text-lg font-medium text-foreground text-center">
        {title}
      </Text>
      <Text className="text-sm text-muted-foreground text-center mt-2">
        {message}
      </Text>
    </View>
  );
}

// Error State Component
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="items-center justify-center py-12 px-6">
      <View className="w-16 h-16 rounded-full bg-destructive/10 items-center justify-center mb-4">
        <AlertCircle size={32} color="#EF4444" />
      </View>
      <Text className="text-lg font-medium text-foreground text-center">
        Something went wrong
      </Text>
      <Text className="text-sm text-muted-foreground text-center mt-2">
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        className="mt-4 px-6 py-2 bg-primary/10 rounded-full"
      >
        <Text className="text-primary font-medium">Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// Loading Skeleton
function LoadingSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="px-4">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className="h-20 bg-card/30 rounded-xl mb-3 animate-pulse"
        />
      ))}
    </View>
  );
}

// Category Filter Pills for Tokens
function TokenCategoryFilter({
  category,
  interval,
  onCategoryChange,
  onIntervalChange,
}: {
  category: TrendingCategory;
  interval: TrendingInterval;
  onCategoryChange: (cat: TrendingCategory) => void;
  onIntervalChange: (int: TrendingInterval) => void;
}) {
  const categories: { value: TrendingCategory; label: string }[] = [
    { value: "trending", label: "Trending" },
    { value: "top_traded", label: "Top Traded" },
    { value: "recent", label: "New" },
  ];

  const intervals: { value: TrendingInterval; label: string }[] = [
    { value: "5m", label: "5m" },
    { value: "1h", label: "1h" },
    { value: "6h", label: "6h" },
    { value: "24h", label: "24h" },
  ];

  return (
    <View className="px-4 mb-3">
      {/* Category Pills */}
      <View className="flex-row mb-2">
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            onPress={() => onCategoryChange(cat.value)}
            className={`px-3 py-1.5 rounded-full mr-2 ${
              category === cat.value
                ? "bg-primary"
                : "bg-card/50 border border-border/30"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                category === cat.value ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Interval Pills */}
      <View className="flex-row">
        {intervals.map((int) => (
          <TouchableOpacity
            key={int.value}
            onPress={() => onIntervalChange(int.value)}
            className={`px-2.5 py-1 rounded-full mr-1.5 ${
              interval === int.value
                ? "bg-accent/20"
                : "bg-card/30"
            }`}
          >
            <Text
              className={`text-[10px] ${
                interval === int.value ? "text-accent font-medium" : "text-muted-foreground"
              }`}
            >
              {int.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// RWA Type Filter
function RwaTypeFilter({
  selectedType,
  availableTypes,
  onTypeChange,
}: {
  selectedType: RwaType | undefined;
  availableTypes: RwaType[];
  onTypeChange: (type: RwaType | undefined) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="px-4 mb-3"
      style={{ maxHeight: 36 }}
      contentContainerStyle={{ alignItems: 'center' }}
    >
      <TouchableOpacity
        onPress={() => onTypeChange(undefined)}
        className={`px-3 py-1.5 rounded-full mr-2 ${
          !selectedType ? "bg-primary" : "bg-card/50 border border-border/30"
        }`}
      >
        <Text
          className={`text-xs font-medium ${
            !selectedType ? "text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          All
        </Text>
      </TouchableOpacity>
      {availableTypes.map((type) => (
        <TouchableOpacity
          key={type}
          onPress={() => onTypeChange(type)}
          className={`px-3 py-1.5 rounded-full mr-2 ${
            selectedType === type
              ? "bg-primary"
              : "bg-card/50 border border-border/30"
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              selectedType === type ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {RWA_TYPE_LABELS[type] || type}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// Market Category Filter
function MarketCategoryFilter({
  selectedCategory,
  categories,
  onCategoryChange,
}: {
  selectedCategory: string | null;
  categories: string[];
  onCategoryChange: (cat: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="px-4 mb-3"
      style={{ maxHeight: 36 }}
      contentContainerStyle={{ alignItems: 'center' }}
    >
      <TouchableOpacity
        onPress={() => onCategoryChange(null)}
        className={`px-3 py-1.5 rounded-full mr-2 ${
          !selectedCategory ? "bg-primary" : "bg-card/50 border border-border/30"
        }`}
      >
        <Text
          className={`text-xs font-medium ${
            !selectedCategory ? "text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          All
        </Text>
      </TouchableOpacity>
      {categories.map((cat) => (
        <TouchableOpacity
          key={cat}
          onPress={() => onCategoryChange(cat)}
          className={`px-3 py-1.5 rounded-full mr-2 ${
            selectedCategory === cat
              ? "bg-primary"
              : "bg-card/50 border border-border/30"
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              selectedCategory === cat ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {cat}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function ExploreScreen({ navigation }: ExploreScreenProps) {
  const [activeTab, setActiveTab] = useState<ExploreTab>("tokens");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tokens Hook
  const {
    tokens,
    category: tokenCategory,
    interval: tokenInterval,
    isLoading: tokensLoading,
    error: tokensError,
    setCategory: setTokenCategory,
    setInterval: setTokenInterval,
    refresh: refreshTokens,
  } = useTrendingTokens();

  // Filter tokens by search
  const filteredTokens = useSearchTrendingTokens(tokens, searchQuery);

  // RWA Hook
  const {
    opportunities: rwaOpportunities,
    isLoading: rwaLoading,
    error: rwaError,
    filterType: rwaFilterType,
    setFilterType: setRwaFilterType,
    availableTypes: rwaAvailableTypes,
    refresh: refreshRwa,
  } = useRwaOpportunities();

  // Markets Hook
  const {
    markets,
    isLoading: marketsLoading,
    error: marketsError,
    categories: marketCategories,
    selectedCategory: marketSelectedCategory,
    setCategory: setMarketCategory,
    refresh: refreshMarkets,
  } = useOpenMarkets();

  // Filter markets by search
  const { results: filteredMarkets, isLoading: searchLoading } =
    useSearchMarkets(searchQuery);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      switch (activeTab) {
        case "tokens":
          await refreshTokens();
          break;
        case "rwa":
          await refreshRwa();
          break;
        case "markets":
          await refreshMarkets();
          break;
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTab, refreshTokens, refreshRwa, refreshMarkets]);

  // Tab data
  const tabs: { id: ExploreTab; label: string; icon: React.ElementType }[] = [
    { id: "tokens", label: "Tokens", icon: Coins },
    { id: "rwa", label: "RWA", icon: Building2 },
    { id: "markets", label: "Markets", icon: BarChart3 },
  ];

  // Handle token press
  const handleTokenPress = useCallback(
    (token: TrendingToken) => {
      // Navigate to token details or swap screen
      // navigation.navigate('TokenDetails', { mint: token.mint });
      console.log("Token pressed:", token.symbol);
    },
    [navigation]
  );

  // Handle RWA press
  const handleRwaPress = useCallback(
    (opportunity: any) => {
      // Navigate to RWA details
      // navigation.navigate('RwaDetails', { mint: opportunity.mint });
      console.log("RWA pressed:", opportunity.symbol);
    },
    [navigation]
  );

  // Handle market press
  const handleMarketPress = useCallback(
    (market: PredictionMarket) => {
      // Navigate to market details or trade screen
      // navigation.navigate('MarketDetails', { marketId: market.marketId });
      console.log("Market pressed:", market.ticker);
    },
    [navigation]
  );

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "tokens":
        if (tokensLoading) {
          return <LoadingSkeleton count={8} />;
        }
        if (tokensError) {
          return <ErrorState message={tokensError} onRetry={refreshTokens} />;
        }
        if (filteredTokens.length === 0) {
          return (
            <EmptyState
              icon={TrendingUp}
              title="No tokens found"
              message={
                searchQuery
                  ? "Try a different search term"
                  : "Pull to refresh and discover trending tokens"
              }
            />
          );
        }
        return (
          <View className="px-4">
            {filteredTokens.map((token, index) => (
              <TrendingTokenItem
                key={token.mint}
                token={token}
                rank={index + 1}
                onPress={() => handleTokenPress(token)}
              />
            ))}
          </View>
        );

      case "rwa":
        if (rwaLoading) {
          return <LoadingSkeleton count={6} />;
        }
        if (rwaError) {
          return <ErrorState message={rwaError} onRetry={refreshRwa} />;
        }
        if (rwaOpportunities.length === 0) {
          return (
            <EmptyState
              icon={Building2}
              title="No RWA opportunities"
              message="Check back later for new investment opportunities"
            />
          );
        }
        return (
          <View className="px-4">
            {rwaOpportunities.map((opp) => (
              <RwaOpportunityItem
                key={opp.mint}
                opportunity={opp}
                onPress={() => handleRwaPress(opp)}
              />
            ))}
          </View>
        );

      case "markets":
        if (marketsLoading || searchLoading) {
          return <LoadingSkeleton count={6} />;
        }
        if (marketsError) {
          return <ErrorState message={marketsError} onRetry={refreshMarkets} />;
        }
        const displayMarkets = searchQuery ? filteredMarkets : markets;
        if (displayMarkets.length === 0) {
          return (
            <EmptyState
              icon={BarChart3}
              title="No open markets"
              message={
                searchQuery
                  ? "Try a different search term"
                  : "Check back later for new prediction markets"
              }
            />
          );
        }
        return (
          <View className="px-4">
            {displayMarkets.map((market) => (
              <OpenMarketItem
                key={market.marketId}
                market={market}
                onPress={() => handleMarketPress(market)}
              />
            ))}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <AmbientBackground>
      <SafeAreaView className="h-full flex flex-col" edges={["top"]}>
        {/* Header */}
        <View className="px-6 pt-4 pb-2">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <Flame size={24} color="#10B981" />
              <Text className="text-2xl font-semibold text-foreground ml-2">
                Explore
              </Text>
            </View>
          </View>

          {/* Search Bar */}
          <View className="flex-row items-center bg-card/50 rounded-xl px-4 py-3 border border-border/30">
            <Search size={18} color="#6B7280" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={`Search ${activeTab}...`}
              placeholderTextColor="#6B7280"
              className="flex-1 ml-3 text-foreground text-base"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Text className="text-muted-foreground text-sm">Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tab Selector */}
        <View className="flex-row px-6 py-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  setSearchQuery("");
                }}
                className={`flex-row items-center px-4 py-2 rounded-full mr-2 ${
                  isActive ? "bg-primary/15" : "bg-card/30"
                }`}
                activeOpacity={0.7}
              >
                <Icon
                  size={16}
                  color={isActive ? "#10B981" : "#6B7280"}
                />
                <Text
                  className={`text-sm font-medium ml-2 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Filters */}
        {activeTab === "tokens" && (
          <TokenCategoryFilter
            category={tokenCategory}
            interval={tokenInterval}
            onCategoryChange={setTokenCategory}
            onIntervalChange={setTokenInterval}
          />
        )}
        {activeTab === "rwa" && rwaAvailableTypes.length > 0 && (
          <RwaTypeFilter
            selectedType={rwaFilterType}
            availableTypes={rwaAvailableTypes}
            onTypeChange={setRwaFilterType}
          />
        )}
        {activeTab === "markets" && marketCategories.length > 0 && (
          <MarketCategoryFilter
            selectedCategory={marketSelectedCategory}
            categories={marketCategories}
            onCategoryChange={setMarketCategory}
          />
        )}

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-24"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#10B981"
            />
          }
        >
          {renderTabContent()}
        </ScrollView>
      </SafeAreaView>
    </AmbientBackground>
  );
}
