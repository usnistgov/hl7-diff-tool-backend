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
        original.data.usage.derived[originalId] = {
          value: derived.usage,
          reason: ""
        };
      }
    }
    if (configuration.cardinality) {
      const card = this.createCard(derived.min, derived.max)
      if (original.data.cardinality && original.data.cardinality.src.value !== card) {
        if (!original.data.cardinality.derived) {
          original.data.cardinality.derived = {};
        }
        original.data.cardinality.derived[originalId] = {
          value: card,
          reason: ""
        };
      }
    }
    // if (configuration.min) {
    //   if (original.data.min && original.data.min.src.value !== derived.min) {
    //     if (!original.data.min.derived) {
    //       original.data.min.derived = {};
    //     }
    //     original.data.min.derived[originalId] = {
    //       value: derived.min,
    //       reason: ""
    //     };
    //   }
    // }
    // if (configuration.max) {
    //   if (original.data.max && original.data.max.src.value !== derived.max) {
    //     if (!original.data.max.derived) {
    //       original.data.max.derived = {};
    //     }
    //     original.data.max.derived[originalId] = {
    //       value: derived.max,
    //       reason: ""
    //     };
    //   }
    // }
  },
  createCard(min, max) {
    return `${min}..${max}`;
  }

  // compare: function(source, derived) {
  //   //TODO: need to add config
  //   let result = {};
  //   if(derived.usage !== source.usage){
  //       result.usage = derived.usage;
  //       //TODO: need to increment the stats
  //   }
  //   if (derived.type === "SEGMENTREF") {
  //   }
  //   return result;
  // }
};


module.exports = ComparisonService;
