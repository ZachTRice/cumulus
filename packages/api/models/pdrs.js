'use strict';

const get = require('lodash.get');

const { getExecutionArn } = require('@cumulus/common/aws');
const { getCollectionIdFromMessage } = require('@cumulus/common/message');
const aws = require('@cumulus/ingest/aws');
const pvl = require('@cumulus/pvl');

const Manager = require('./base');
const pdrSchema = require('./schemas').pdr;


class Pdr extends Manager {
  constructor() {
    super({
      tableName: process.env.PdrsTable,
      tableHash: { name: 'pdrName', type: 'S' },
      schema: pdrSchema
    });
  }

  /**
   * Generate PAN message
   *
   * @returns {string} the PAN message
   */
  static generatePAN() {
    return pvl.jsToPVL(
      new pvl.models.PVLRoot()
        .add('MESSAGE_TYPE', new pvl.models.PVLTextString('SHORTPAN'))
        .add('DISPOSITION', new pvl.models.PVLTextString('SUCCESSFUL'))
        .add('TIME_STAMP', new pvl.models.PVLDateTime(new Date()))
    );
  }

  /**
   * Generate a PDRD message with a given err
   *
   * @param {Object} err - the error object
   * @returns {string} the PDRD message
   */
  static generatePDRD(err) {
    return pvl.jsToPVL(
      new pvl.models.PVLRoot()
        .add('MESSAGE_TYPE', new pvl.models.PVLTextString('SHORTPDRD'))
        .add('DISPOSITION', new pvl.models.PVLTextString(err.message))
    );
  }

  /**
   * Create a new PDR record from incoming SNS messages
   *
   * @param {Object} payload - SNS message containing the output of a Cumulus Step Function
   * @returns {Promise<Object>} a PDR record
   */
  createPdrFromSns(payload) {
    const name = get(payload, 'cumulus_meta.execution_name');
    const pdrObj = get(payload, 'payload.pdr', get(payload, 'meta.pdr'));
    const pdrName = get(pdrObj, 'name');

    if (!pdrName) return Promise.resolve();

    const arn = getExecutionArn(
      get(payload, 'cumulus_meta.state_machine'),
      name
    );
    const execution = aws.getExecutionUrl(arn);

    const collectionId = getCollectionIdFromMessage(payload);

    const stats = {
      processing: get(payload, 'payload.running', []).length,
      completed: get(payload, 'payload.completed', []).length,
      failed: get(payload, 'payload.failed', []).length
    };

    stats.total = stats.processing + stats.completed + stats.failed;
    let progress = 0;
    if (stats.processing > 0 && stats.total > 0) {
      progress = ((stats.total - stats.processing) / stats.total) * 100;
    } else if (stats.processing === 0 && stats.total > 0) {
      progress = 100;
    }

    const doc = {
      pdrName,
      collectionId,
      status: get(payload, 'meta.status'),
      provider: get(payload, 'meta.provider.id'),
      progress,
      execution,
      PANSent: get(pdrObj, 'PANSent', false),
      PANmessage: get(pdrObj, 'PANmessage', 'N/A'),
      stats,
      createdAt: get(payload, 'cumulus_meta.workflow_start_time'),
      timestamp: Date.now()
    };

    doc.duration = (doc.timestamp - doc.createdAt) / 1000;

    return this.create(doc);
  }

  /**
   * Only used for testing
   */
  async deletePdrs() {
    const pdrs = await this.scan();
    return Promise.all(pdrs.Items.map((pdr) => super.delete({ pdrName: pdr.pdrName })));
  }
}

module.exports = Pdr;
