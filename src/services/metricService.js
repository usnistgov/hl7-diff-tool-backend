let MetricService = {
  updateUsageOverview(
    originalId,
    originalProfile,
    path,
    element,
    globalPath,
    srcValue,
    derivedValue
  ) {
    if (path && element) {
      if (!originalProfile.summaries) {
        originalProfile.summaries = {};
      }
      //Usage Changes overview
      if (!originalProfile.summaries.usageChangesOverview) {
        originalProfile.summaries.usageChangesOverview = {};
      }

      if (!originalProfile.summaries.usageChangesOverview[path]) {
        originalProfile.summaries.usageChangesOverview[path] = {
          type: element.type,
          name: element.name,
          globalPath,
          path
        };
      }

      if (!originalProfile.summaries.usageChangesOverview[path][originalId]) {
        originalProfile.summaries.usageChangesOverview[path][
          originalId
        ] = derivedValue;
      }
      if (!originalProfile.summaries.usageChangesOverview[path].src) {
        originalProfile.summaries.usageChangesOverview[path].src = srcValue;
      }
    }
  },
  updateChangesTable(
    originalId,
    originalProfile,
    path,
    element,
    option,
    globalPath,
    srcValue,
    derivedValue
  ) {
    if (path && element) {
      if (!originalProfile.summaries) {
        originalProfile.summaries = {};
      }
      //by profile
      if (!originalProfile.summaries.changesTable) {
        originalProfile.summaries.changesTable = {};
      }
      if (!originalProfile.summaries.changesTable[originalId]) {
        originalProfile.summaries.changesTable[originalId] = {};
      }
      if (!originalProfile.summaries.changesTable[originalId][path]) {
        originalProfile.summaries.changesTable[originalId][path] = {
          total: 0,
          type: element.type,
          name: element.name,
          globalPath,
          path
        };
      }
      if (!originalProfile.summaries.changesTable[originalId][path][option]) {
        originalProfile.summaries.changesTable[originalId][path][option] = 0;
      }
      originalProfile.summaries.changesTable[originalId][path].total++;
      originalProfile.summaries.changesTable[originalId][path][option]++;

      //Summaries overview
      if (!originalProfile.summaries.overview) {
        originalProfile.summaries.overview = {};
      }
      if (!originalProfile.summaries.overview[originalId]) {
        originalProfile.summaries.overview[originalId] = {};
      }
      if (!originalProfile.summaries.overview[originalId][option]) {
        originalProfile.summaries.overview[originalId][option] = 0;
      }
      originalProfile.summaries.overview[originalId][option]++;
      if (!originalProfile.summaries.overview[originalId].total) {
        originalProfile.summaries.overview[originalId].total = 0;
      }
      originalProfile.summaries.overview[originalId].total++;

      //Total
      if (!originalProfile.summaries.totalChangesTable) {
        originalProfile.summaries.totalChangesTable = {};
      }

      if (!originalProfile.summaries.totalChangesTable[path]) {
        originalProfile.summaries.totalChangesTable[path] = {
          total: 0,
          type: element.type,
          name: element.name,
          globalPath,
          path
        };
      }
      if (!originalProfile.summaries.totalChangesTable[path][originalId]) {
        originalProfile.summaries.totalChangesTable[path][originalId] = 0;
      }
      if (!originalProfile.summaries.totalChangesTable[path][option]) {
        originalProfile.summaries.totalChangesTable[path][option] = 0;
      }
      originalProfile.summaries.totalChangesTable[path].total++;
      originalProfile.summaries.totalChangesTable[path][option]++;
      originalProfile.summaries.totalChangesTable[path][originalId]++;
    }
  },
  updateUsageMetrics(
    originalId,
    originalProfile,
    srcUsage,
    derivedUsage,
    path,
    element,
    globalPath
  ) {
    let result;
    this.updateChangesTable(
      originalId,
      originalProfile,
      path,
      element,
      "usage",
      globalPath,
      srcUsage,
      derivedUsage
    );
    this.updateUsageOverview(
      originalId,
      originalProfile,
      path,
      element,
      globalPath,
      srcUsage,
      derivedUsage
    );

    if (!originalProfile.usageReport) {
      originalProfile.usageReport = {
        stronger: {
          total: 0,
          list: []
        },
        weaker: {
          total: 0,
          list: []
        },
        relaxed: {
          total: 0,
          list: []
        },
        removed: {
          total: 0,
          list: []
        },
        allowance: {
          total: 0,
          list: []
        }
      };
    }

    if (!originalProfile.overview) {
      originalProfile.overview = {
        usage: 0,
        card: 0,
        error: 0
      };
    }

    if (!originalProfile.compliance) {
      originalProfile.compliance = {};
    }

    if (!originalProfile.totalCompliance) {
      originalProfile.totalCompliance = {
        total: {
          warning: 0,
          info: 0,
          error: 0
        },
        usage: {
          warning: 0,
          info: 0,
          error: 0
        }
      };
    }
    if (!originalProfile.compliance[originalId]) {
      originalProfile.compliance[originalId] = {
        total: {
          warning: 0,
          info: 0,
          error: 0
        },
        usage: {
          warning: 0,
          info: 0,
          error: 0
        }
      };
    }
    if (!originalProfile.percentage) {
      originalProfile.percentage = {};
    }
    if (!originalProfile.totalPercentage) {
      originalProfile.totalPercentage = {};
    }
    if (!originalProfile.totalPercentage.usage) {
      originalProfile.totalPercentage.usage = {
        rc: 0,
        rre: 0,
        ro: 0,
        rx: 0,
        rec: 0,
        rer: 0,
        reo: 0,
        rex: 0,
        cr: 0,
        cre: 0,
        co: 0,
        cx: 0,
        oc: 0,
        or: 0,
        ore: 0,
        ox: 0,
        xc: 0,
        xr: 0,
        xre: 0,
        xo: 0,
        total: 0
      };
    }
    if (!originalProfile.percentage[originalId]) {
      originalProfile.percentage[originalId] = {};
    }
    if (!originalProfile.percentage[originalId].usage) {
      originalProfile.percentage[originalId].usage = {
        rc: 0,
        rre: 0,
        ro: 0,
        rx: 0,
        rec: 0,
        rer: 0,
        reo: 0,
        rex: 0,
        cr: 0,
        cre: 0,
        co: 0,
        cx: 0,
        oc: 0,
        or: 0,
        ore: 0,
        ox: 0,
        xc: 0,
        xr: 0,
        xre: 0,
        xo: 0,
        total: 0
      };
    }

    if (srcUsage.startsWith("C")) {
      if(derivedUsage.startsWith("C") && srcUsage !== derivedUsage){
        const srcTrue = srcUsage[2];
        const srcFalse = srcUsage[4];
        const derTrue = derivedUsage[2];
        const derFalse = derivedUsage[4];
        if(srcTrue !== derTrue){
          
        }

      }
      if (derivedUsage === "R") {
        originalProfile.compliance[originalId].total.info++;
        originalProfile.compliance[originalId].usage.info++;
        originalProfile.totalCompliance.total.info++;
        originalProfile.totalCompliance.usage.info++;
        originalProfile.totalPercentage.usage.total++;
        originalProfile.totalPercentage.usage.cr++;
        originalProfile.percentage[originalId].usage.total++;
        originalProfile.percentage[originalId].usage.cr++;
        // originalProfile.usageReport.stronger.total++;
        // originalProfile.usageReport.stronger.list.push({
        //   ig: originalId,
        //   profile: "IZ22",
        //   path: path,
        //   usage: derivedUsage,
        //   srcUsage: srcUsage
        // });
        result = "info";
      }
      if (derivedUsage === "RE") {
        originalProfile.compliance[originalId].total.info++;
        originalProfile.compliance[originalId].usage.info++;
        originalProfile.totalCompliance.total.info++;
        originalProfile.totalCompliance.usage.info++;
        originalProfile.totalPercentage.usage.total++;
        originalProfile.totalPercentage.usage.cre++;
        originalProfile.percentage[originalId].usage.total++;
        originalProfile.percentage[originalId].usage.cre++;
        result = "info";
      }
      if (derivedUsage === "O") {
        originalProfile.compliance[originalId].total.warning++;
        originalProfile.compliance[originalId].usage.warning++;
        originalProfile.totalCompliance.total.warning++;
        originalProfile.totalCompliance.usage.warning++;
        originalProfile.totalPercentage.usage.total++;
        originalProfile.totalPercentage.usage.co++;
        originalProfile.percentage[originalId].usage.total++;
        originalProfile.percentage[originalId].usage.co++;
        result = "warning";
      }
      if (derivedUsage === "X") {
        originalProfile.compliance[originalId].total.error++;
        originalProfile.compliance[originalId].usage.error++;
        originalProfile.totalCompliance.total.error++;
        originalProfile.totalCompliance.usage.error++;
        originalProfile.totalPercentage.usage.total++;
        originalProfile.totalPercentage.usage.cx++;
        originalProfile.percentage[originalId].usage.total++;
        originalProfile.percentage[originalId].usage.cx++;
        result = "error";
      }
    }
    switch (srcUsage) {
      case "R":
        if (derivedUsage.startsWith("C")) {
          originalProfile.compliance[originalId].total.warning++;
          originalProfile.compliance[originalId].usage.warning++;
          originalProfile.totalCompliance.total.warning++;
          originalProfile.totalCompliance.usage.warning++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.rc++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.rc++;
         
          result = "warning";
        }
        if (derivedUsage === "RE") {
          originalProfile.compliance[originalId].total.warning++;
          originalProfile.compliance[originalId].usage.warning++;
          originalProfile.totalCompliance.total.warning++;
          originalProfile.totalCompliance.usage.warning++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.rre++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.rre++;
          originalProfile.usageReport.relaxed.total++;
          originalProfile.usageReport.relaxed.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });

          result = "warning";
        }
        if (derivedUsage === "O") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.ro++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.ro++;
          originalProfile.usageReport.relaxed.total++;
          originalProfile.usageReport.relaxed.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
        }
        if (derivedUsage === "X") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.rx++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.rx++;
          originalProfile.usageReport.removed.total++;
          originalProfile.usageReport.removed.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
        }
        break;
      case "RE":
        if (derivedUsage.startsWith("C")) {
          originalProfile.compliance[originalId].total.warning++;
          originalProfile.compliance[originalId].usage.warning++;
          originalProfile.totalCompliance.total.warning++;
          originalProfile.totalCompliance.usage.warning++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.rec++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.rec++;
          result = "warning";
          break;
        }
        if (derivedUsage === "R") {
          originalProfile.compliance[originalId].total.info++;
          originalProfile.compliance[originalId].usage.info++;
          originalProfile.totalCompliance.total.info++;
          originalProfile.totalCompliance.usage.info++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.rer++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.rer++;
          result = "info";
          originalProfile.usageReport.stronger.total++;
          originalProfile.usageReport.stronger.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          break;
        }
        if (derivedUsage === "O") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.reo++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.reo++;
          originalProfile.usageReport.relaxed.total++;
          originalProfile.usageReport.relaxed.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
          break;
        }
        if (derivedUsage === "X") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.rex++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.rex++;
          originalProfile.usageReport.removed.total++;
          originalProfile.usageReport.removed.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
          break;
        }
        break;
      case "O":
        if (derivedUsage.startsWith("C")) {
          originalProfile.compliance[originalId].total.info++;
          originalProfile.compliance[originalId].usage.info++;
          originalProfile.totalCompliance.total.info++;
          originalProfile.totalCompliance.usage.info++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.oc++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.oc++;
          result = "info";
          break;
        }
        if (derivedUsage === "R") {
          originalProfile.compliance[originalId].total.info++;
          originalProfile.compliance[originalId].usage.info++;
          originalProfile.totalCompliance.total.info++;
          originalProfile.totalCompliance.usage.info++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.or++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.or++;
          result = "info";
          originalProfile.usageReport.stronger.total++;
          originalProfile.usageReport.stronger.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          break;
        }
        if (derivedUsage === "RE") {
          originalProfile.compliance[originalId].total.info++;
          originalProfile.compliance[originalId].usage.info++;
          originalProfile.totalCompliance.total.info++;
          originalProfile.totalCompliance.usage.info++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.ore++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.ore++;
          originalProfile.usageReport.stronger.total++;
          originalProfile.usageReport.stronger.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "info";
          break;
        }
        if (derivedUsage === "X") {
          originalProfile.compliance[originalId].total.warning++;
          originalProfile.compliance[originalId].usage.warning++;
          originalProfile.totalCompliance.total.warning++;
          originalProfile.totalCompliance.usage.warning++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.ox++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.ox++;
          originalProfile.usageReport.stronger.total++;
          originalProfile.usageReport.stronger.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "warning";
          break;
        }
        break;
      case "X":
        if (derivedUsage.startsWith("C")) {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.xc++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.xc++;
          result = "error";
          break;
        }
        if (derivedUsage === "R") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.usage.total.error++;
          originalProfile.totalCompliance.usage.usage.error++;
          originalProfile.totalPercentage.total++;
          originalProfile.totalPercentage.xr++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.xr++;
          originalProfile.usageReport.stronger.total++;
          originalProfile.usageReport.stronger.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
   
          break;
        }
        if (derivedUsage === "RE") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.xre++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.xre++;
          originalProfile.usageReport.stronger.total++;
          originalProfile.usageReport.stronger.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
         
          break;
        }
        if (derivedUsage === "O") {
          originalProfile.compliance[originalId].total.error++;
          originalProfile.compliance[originalId].usage.error++;
          originalProfile.totalCompliance.total.error++;
          originalProfile.totalCompliance.usage.error++;
          originalProfile.totalPercentage.usage.total++;
          originalProfile.totalPercentage.usage.xo++;
          originalProfile.percentage[originalId].usage.total++;
          originalProfile.percentage[originalId].usage.xo++;
          originalProfile.usageReport.allowance.total++;
          originalProfile.usageReport.allowance.list.push({
            ig: originalId,
            profile: "IZ22",
            path: path,
            usage: derivedUsage,
            srcUsage: srcUsage
          });
          result = "error";
          break;
        }
        break;
    }

    if (result === "error") {
      //Compliance error table
      if (!originalProfile.summaries.complianceErrorTable) {
        originalProfile.summaries.complianceErrorTable = {};
      }

      if (!originalProfile.summaries.complianceErrorTable[path]) {
        originalProfile.summaries.complianceErrorTable[path] = {
          type: element.type,
          name: element.name,
          globalPath,
          path
        };
      }

      if (!originalProfile.summaries.complianceErrorTable[path][originalId]) {
        originalProfile.summaries.complianceErrorTable[path][
          originalId
        ] = derivedUsage;
      }
      if (!originalProfile.summaries.complianceErrorTable[path].src) {
        originalProfile.summaries.complianceErrorTable[path].src = srcUsage;
      }
    }
    return result;
  },
  updateCardinalityMetrics(
    originalId,
    originalProfile,
    srcCardinality,
    derivedCardinality,
    path,
    element,
    globalPath
  ) {
    this.updateChangesTable(
      originalId,
      originalProfile,
      path,
      element,
      "cardinality",
      globalPath,
      srcCardinality,
      derivedCardinality
    );
    const srcCard = srcCardinality.split("..");
    const derivedCard = derivedCardinality.split("..");
    if (!originalProfile.percentage) {
      originalProfile.percentage = {};
    }
    if (!originalProfile.totalPercentage) {
      originalProfile.totalPercentage = {};
    }
    if (!originalProfile.totalPercentage.cardinality) {
      originalProfile.totalPercentage.cardinality = {
        min: {
          "0x": 0,
          x0: 0,
          xx: 0,
          total: 0
        },
        max: {
          "x*": 0,
          "*x": 0,
          xx: 0,
          total: 0
        }
      };
    }
    if (!originalProfile.percentage[originalId]) {
      originalProfile.percentage[originalId] = {};
    }
    if (!originalProfile.percentage[originalId].cardinality) {
      originalProfile.percentage[originalId].cardinality = {
        min: {
          "0x": 0,
          x0: 0,
          xx: 0,
          total: 0
        },
        max: {
          "x*": 0,
          "*x": 0,
          xx: 0,
          total: 0
        }
      };
    }
    if (srcCard[0] === "0" && derivedCard[0] !== "0") {
      originalProfile.percentage[originalId].cardinality.min["0x"]++;
      originalProfile.totalPercentage.cardinality.min["0x"]++;
    }
    if (srcCard[0] !== "0" && derivedCard[0] === "0") {
      originalProfile.percentage[originalId].cardinality.min["x0"]++;
      originalProfile.totalPercentage.cardinality.min["x0"]++;
    }
    if (srcCard[1] !== "*" && derivedCard[1] === "*") {
      originalProfile.percentage[originalId].cardinality.max["x*"]++;
      originalProfile.totalPercentage.cardinality.max["x*"]++;
    }
    if (srcCard[1] === "*" && derivedCard[1] !== "*") {
      originalProfile.percentage[originalId].cardinality.max["*x"]++;
      originalProfile.totalPercentage.cardinality.max["*x"]++;
    }
    if (srcCard[0] !== derivedCard[0]) {
      if (srcCard[0] !== "0" && srcCard[0] !== "0") {
        originalProfile.percentage[originalId].cardinality.min["xx"]++;
        originalProfile.totalPercentage.cardinality.min["xx"]++;
      }
      originalProfile.totalPercentage.cardinality.min.total++;
      originalProfile.percentage[originalId].cardinality.min.total++;
    }
    if (srcCard[1] !== derivedCard[1]) {
      if (srcCard[1] !== "*" && derivedCard[1] !== "*") {
        originalProfile.percentage[originalId].cardinality.max["xx"]++;
        originalProfile.totalPercentage.cardinality.max["xx"]++;
      }
      originalProfile.totalPercentage.cardinality.max.total++;
      originalProfile.percentage[originalId].cardinality.max.total++;
    }

    if (!originalProfile.compliance) {
      originalProfile.compliance = {};
    }
    if (!originalProfile.totalCompliance) {
      originalProfile.totalCompliance = {
        total: {
          warning: 0,
          info: 0,
          error: 0
        },
        usage: {
          warning: 0,
          info: 0,
          error: 0
        }
      };
    }
  },
  updateDatatypeMetrics(
    originalId,
    originalProfile,
    srcDatatype,
    derivedDatatype,
    path,
    element,
    globalPath
  ) {
    this.updateChangesTable(
      originalId,
      originalProfile,
      path,
      element,
      "datatype",
      globalPath,
      srcDatatype,
      derivedDatatype
    );
    if (!originalProfile.compliance) {
      originalProfile.compliance = {};
    }
    if (!originalProfile.totalCompliance) {
      originalProfile.totalCompliance = {
        total: {
          warning: 0,
          info: 0,
          error: 0
        },
        usage: {
          warning: 0,
          info: 0,
          error: 0
        }
      };
    }
  },

  updateBindingMetrics(originalId, originalProfile, attribute) {
    if (!originalProfile.percentage) {
      originalProfile.percentage = {};
    }
    if (!originalProfile.totalPercentage) {
      originalProfile.totalPercentage = {};
    }
    if (!originalProfile.totalPercentage.binding) {
      originalProfile.totalPercentage.binding = {
        vs: 0,
        codes: 0,
        strength: 0,
        location: 0,
        total: 0
      };
    }
    if (!originalProfile.percentage[originalId]) {
      originalProfile.percentage[originalId] = {};
    }
    if (!originalProfile.percentage[originalId].binding) {
      originalProfile.percentage[originalId].binding = {
        vs: 0,
        codes: 0,
        strength: 0,
        location: 0,
        total: 0
      };
    }
    originalProfile.totalPercentage.binding[attribute]++;
    originalProfile.totalPercentage.binding.total++;

    originalProfile.percentage[originalId].binding[attribute]++;
    originalProfile.percentage[originalId].binding.total++;
  }
};

module.exports = MetricService;
