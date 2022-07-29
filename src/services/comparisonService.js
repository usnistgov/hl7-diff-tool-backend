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
    if(configuration.predicate){

      if (original.data.predicate && original.data.predicate.src.value !== derived.predicate) {
        if (!original.data.predicate.derived) {
          original.data.predicate.derived = {};
        }
        original.changed = true;
        original.data.changed = true;
        original.data.changeTypes.push("predicate");

        original.data.predicate.derived[originalId] = {
          value: derived.predicate,
        };
      }
    }

    if (configuration.usage) {
      if (!original.data.consequential) {
        original.data.consequential = {
          src: false,
          derived: {}
        };
      }
      if(derived.usage === "RE" || derived.usage === "R"){
        original.data.consequential.derived[originalId] = true;
        original.data.consequential.src = true;
      }
      if (original.data.usage.src.value !== derived.usage) {
      
        if (!original.data.usage.derived) {
          original.data.usage.derived = {};
        }
        original.changed = true;
        original.data.changed = true;
        original.data.changeTypes.push("usage");

        const compliance = MetricService.updateUsageMetrics(
          originalId,
          originalProfile,
          original.data.usage.src.value,
          derived.usage,
          original.data.position,
          original.data,
          original.data.position
        );
        original.data.usage.derived[originalId] = {
          value: derived.usage,
          reason: "",
          compliance
        };
      } else {
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
        original.changed = true;
        original.data.changed = true;
        original.data.changeTypes.push("cardinality");

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
  }
};

module.exports = ComparisonService;
