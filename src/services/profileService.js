const ComparisonService = require("./comparisonService");

let ProfileService = {
  populateSourceProfile(source) {
    let result = {
      ig: source.ig,
      profiles: {}
    };
    source.profiles.forEach(profile => {
      result.profiles[profile["$"].id] = {
        name: profile["$"].name,
        description: profile["$"].description,
        title: profile["$"].title,
        profile: this.serializeProfile(profile.ConformanceProfile)
      };
    });
    return result;
  },
  serializeProfile(profile) {
    let result = {};
    if (profile[0]) {
      profile = profile[0];
      if (profile.SegmentRef && profile.SegmentRef.length > 0) {
        result.segRefs = this.serializeSegRefs(profile.SegmentRef);
      }
      if (profile.Group && profile.Group.length > 0) {
        result.groups = this.serializeGroups(profile.Group);
      }
    }
    return result;
  },
  serializeGroups(groups) {
    let result = {};
    if (groups) {
      groups.forEach(group => {
        const length = group.SegmentRef.length;
        const usage = group.SegmentRef[0]["$"].usage;
        group.SegmentRef.splice(length - 1, 1);
        group.SegmentRef.splice(0, 1);

        result[group["$"].position] = {
          name: group["$"].name,
          cardinality: this.createCard(group["$"].min, group["$"].max),
          min: group["$"].min,
          max: group["$"].max,
          usage: usage,
          position: group["$"].position,
          segRefs: this.serializeSegRefs(group.SegmentRef),
          groups: this.serializeGroups(group.Group)
        };
      });
    }

    return result;
  },
  serializeSegRefs(refs) {
    let result = {};
    if (refs) {
      refs.forEach(ref => {
        result[ref["$"].position] = {
          ref: ref["$"].ref,
          description: ref["$"].description,
          usage: ref["$"].usage,
          iDSeg: ref["$"].iDSeg,
          label: ref["$"].label,
          cardinality: this.createCard(ref["$"].min, ref["$"].max),

          min: ref["$"].min,
          max: ref["$"].max,
          position: ref["$"].position
        };
      });
    }
    return result;
  },
  createCard(min, max) {
    return `${min}..${max}`;
  }
};

module.exports = ProfileService;
