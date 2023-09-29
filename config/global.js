module.exports = {
  errorCodes: {
    api_unavailable: 'ER_NO_SUCH_API',
    missing_params: 'ER_MISSING_MAND_PARAMS',
    api_unexpected_error: 'ER_UNEXPECTED_ERR',
    api_unauthorized_access: 'ER_UNAUTHORIZED_ACCESS',
  },

  errorMessages: {
    error_generic:
      'Some error occured while fetching data. Please try again later.',
    error_unauthorized_access:
      'Access blocked. Authentication missing.',
  },

  configLabels: {
    usage: 'Usage',
    cardinality: 'Cardinality',
    datatype: 'Data type',
    segmentRef: 'Segment Ref.',
    valueset: 'Value set',
    predicate: 'Predicate',
    conformanceStatement: 'Conformance statement',
    coConstraint: 'Co-constraint',
    name: 'Name',
    slicing: 'Slicing',
  },
};
