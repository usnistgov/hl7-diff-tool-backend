const MetricService = require("./metricService");

let ComparisonService = {
  compare: function(
    originalId,
    originalProfile,
    original,
    derived,
    configuration
  ) {
    if (
      original.data.type === "segmentRef" &&
      original.data.label.src.value !== derived.label
    ) {
      if (!original.data.label.derived) {
        original.data.label.derived = {};
      }
      original.data.label.derived[originalId] = {
        value: derived.label,
        reason: ""
      };
    }

    if (configuration.usage) {
      if (original.data.usage.src.value !== derived.usage) {
        if (!original.data.usage.derived) {
          original.data.usage.derived = {};
        }
        const compliance = MetricService.updateUsageMetrics(
          originalId,
          originalProfile,
          original.data.usage.src.value,
          derived.usage,
          original.data.position,
          original.data,
          original.data.position,
        );
        original.data.usage.derived[originalId] = {
          value: derived.usage,
          reason: "",
          compliance
        };
      }
    }
    if (configuration.cardinality) {
      const card = this.createCard(derived.min, derived.max);
      if (
        original.data.cardinality &&
        original.data.cardinality.src.value !== card
      ) {
        if (!original.data.cardinality.derived) {
          original.data.cardinality.derived = {};
        }
        const compliance = MetricService.updateCardinalityMetrics(
          originalId,
          originalProfile,
          original.data.cardinality.src.value,
          card,
          null,
          null,
          null
        );
        original.data.cardinality.derived[originalId] = {
          value: card,
          reason: "",
          compliance
        };
      }
    }
  },
  createCard(min, max) {
    return `${min}..${max}`;
  },


};

module.exports = ComparisonService;
