'use strict'

const d3 = require('./d3-subset.js')
const SvgContentGroup = require('./svg-content.js')
const LineCoordinates = require('../layout/line-coordinates.js')

class Links extends SvgContentGroup {
  isBelowFullLabelThreshold (connection) {
    // If label doesn't have space to be x6 as wide as it is tall, use smaller label
    return connection.getVisibleLineLength() < this.ui.settings.labelMinimumSpace * 6
  }
  isBelowLabelThreshold (connection) {
    // For label to not look messy, we need space for it and same again either side
    return connection.getVisibleLineLength() < this.ui.settings.labelMinimumSpace * 3
  }
  isBelowVisibilityThreshold (connection) {
    return connection.getVisibleLineLength() < 1
  }

  setData () {
    const dataArray = this.ui.layout.connections
    const identfier = '.links-group .link-wrapper'
    super.setData(dataArray, identfier)

    if (this.segmentedLinesMap) {
      for (const [targetId, segmentGroup] of this.segmentedLinesMap) {
        const decimalsArray = getDecimalsArray(this.ui.layout.connectionsByTargetId.get(targetId).targetNode)
        segmentGroup.selectAll('.link-segment').data(decimalsArray)
      }
    }
  }

  initializeFromData () {
    this.d3Element.classed('links-group', true)

    this.d3OuterLines = null
    this.d3InnerLines = null
    this.d3Links = this.d3Enter.append('g')
      .attr('class', connection => `party-${connection.targetNode.mark.get('party')}`)
      .classed('link-wrapper', true)
      .classed('below-threshold-1', (d) => this.isBelowFullLabelThreshold(d))
      .classed('below-threshold-2', (d) => this.isBelowLabelThreshold(d))
      .classed('below-threshold-3', (d) => this.isBelowVisibilityThreshold(d))
      .on('mouseover', d => this.ui.highlightNode(d.targetLayoutNode))
      .on('mouseout', () => this.ui.highlightNode(null))
      .on('click', connection => {
        d3.event.stopPropagation()
        const targetUI = this.ui.selectNode(connection.targetLayoutNode)
        if (targetUI !== this.ui) {
          this.ui.originalUI.emit('navigation', { from: this.ui, to: targetUI })
        }
      })

    this.addLines()
    this.addLineSegments()

    this.addLabels()
  }

  addLines () {
    this.d3OuterLines = this.d3Links.append('path')
      .classed('link-outer', true)
      .classed('by-variable', true)
      .style('stroke-width', this.ui.settings.lineWidth)
      .on('mouseover', connection => this.ui.emit('highlightParty', connection.targetNode.mark.get('party')))
      .on('mouseout', () => this.ui.emit('highlightParty', null))

    // This line is invisible except for in debug/spiderweb mode
    this.d3InnerLines = this.d3Links.append('line')
      .classed('link-inner', true)
  }

  addLabels () {
    this.d3TimeLabels = this.d3Links.append('text')
      .classed('time-label', true)
      .classed('text-label', true)
  }

  addLineSegments () {
    this.segmentedLinesMap = new Map()

    const linesWithSegments = this.d3Links.filter('.link-wrapper:not(.below-visibility-threshold)')

    linesWithSegments.each((connection, i, nodes) => {
      const link = d3.select(nodes[i])
      const targetNode = connection.targetNode

      const decimalsArray = getDecimalsArray(targetNode)

      link.append('g')
        .classed('link-segments', true)
        .selectAll('line.link-segment')
        .data(decimalsArray)
        .enter()
        .append('line')
        .attr('class', decimal => `type-${decimal[0]}`)
        .style('stroke-width', this.ui.settings.lineWidth)
        .classed('link-segment', true)
        .on('mouseover', decimal => this.ui.emit('highlightType', decimal[0]))
        .on('mouseout', () => this.ui.emit('highlightType', null))

      this.segmentedLinesMap.set(connection.targetId, link.selectAll('line.link-segment'))
    })
  }

  getOuterLinePath (radiusOffset, length) {
    // Returns a path definition for a path around a line shaped like ■■■■■■■■■■▶
    const degrees = radiusOffset.degrees

    const toLineEndpoint = new LineCoordinates({
      x1: radiusOffset.x2,
      y1: radiusOffset.y2,
      length: length,
      degrees
    })
    const topLeft = new LineCoordinates({
      x1: radiusOffset.x2,
      y1: radiusOffset.y2,
      length: this.ui.settings.strokePadding,
      degrees: degrees - 90
    })
    const bottomLeft = new LineCoordinates({
      x1: radiusOffset.x2,
      y1: radiusOffset.y2,
      length: this.ui.settings.strokePadding,
      degrees: degrees + 90
    })
    const topRight = new LineCoordinates({
      x1: toLineEndpoint.x2,
      y1: toLineEndpoint.y2,
      length: this.ui.settings.strokePadding,
      degrees: degrees - 90
    })
    const bottomRight = new LineCoordinates({
      x1: toLineEndpoint.x2,
      y1: toLineEndpoint.y2,
      length: this.ui.settings.strokePadding,
      degrees: degrees + 90
    })
    const tip = new LineCoordinates({
      x1: toLineEndpoint.x2,
      y1: toLineEndpoint.y2,
      length: this.ui.settings.strokePadding,
      degrees
    })
    return `M${topLeft.x2},${topLeft.y2}L${topRight.x2},${topRight.y2}L${tip.x2},${tip.y2}` +
      `L${bottomRight.x2},${bottomRight.y2}L${bottomLeft.x2},${bottomLeft.y2}`
  }

  draw () {
    const outerLinesArray = this.d3OuterLines.nodes()
    const innerLinesArray = this.d3InnerLines.nodes()
    const timeLabelsArray = this.d3TimeLabels.nodes()

    this.d3Links.each((connection, linkIndex, nodes) => {
      const d3OuterLine = d3.select(outerLinesArray[linkIndex])
      const d3InnerLine = d3.select(innerLinesArray[linkIndex])
      const d3TimeLabel = d3.select(timeLabelsArray[linkIndex])
      const d3LinkGroup = d3.select(nodes[linkIndex])

      const sourcePosition = connection.sourceLayoutNode.position
      const targetPosition = connection.targetLayoutNode.position

      const connectCentresCoords = new LineCoordinates({
        x1: sourcePosition.x,
        y1: sourcePosition.y,
        x2: targetPosition.x,
        y2: targetPosition.y
      })
      Links.applyLineXYs(d3InnerLine, connectCentresCoords)

      const sourceRadius = connection.getSourceRadius()

      // Use this offset to start lines at outer rim of circle radius
      const offsetLength = sourceRadius + this.ui.settings.lineWidth / 2
      const offsetBeforeLine = new LineCoordinates({
        radians: connectCentresCoords.radians,
        length: offsetLength,
        x1: connectCentresCoords.x1,
        y1: connectCentresCoords.y1
      })

      const visibleLength = connection.getVisibleLineLength()
      d3OuterLine.attr('d', this.getOuterLinePath(offsetBeforeLine, visibleLength))

      const targetId = connection.targetId
      if (this.segmentedLinesMap && this.segmentedLinesMap.has(targetId)) {
        const d3SegmentsGroup = this.segmentedLinesMap.get(targetId)

        let segmentCoordinates = offsetBeforeLine

        d3SegmentsGroup.each((decimal, segmentIndex, nodes) => {
          const d3LineSegment = d3.select(nodes[segmentIndex])
          const segmentLength = visibleLength * decimal[1]

          // Endpoint of the last segment becomes the start point / offset of the next
          segmentCoordinates = new LineCoordinates({
            x1: segmentCoordinates.x2,
            y1: segmentCoordinates.y2,
            length: segmentLength,
            radians: segmentCoordinates.radians
          })

          Links.applyLineXYs(d3LineSegment, segmentCoordinates)
        })
      }

      if (!d3LinkGroup.classed('below-threshold-2')) {
        const betweenTime = this.ui.formatNumber(connection.targetNode.getBetweenTime())
        d3TimeLabel.text(betweenTime + (d3LinkGroup.classed('below-threshold-1') ? '' : '\u2009ms'))

        const toMidwayPoint = new LineCoordinates({
          x1: offsetBeforeLine.x2,
          y1: offsetBeforeLine.y2,
          length: visibleLength / 2,
          radians: offsetBeforeLine.radians
        })
        let degrees = connectCentresCoords.degrees
        if (degrees > 90) degrees -= 180
        if (degrees < -90) degrees += 180

        d3TimeLabel.attr('y', 0 - this.ui.settings.strokePadding - this.ui.settings.lineWidth)
        d3TimeLabel.attr('transform', `translate(${toMidwayPoint.x2}, ${toMidwayPoint.y2}) rotate(${degrees})`)
      }
    })
  }

  static applyLineXYs (d3Line, lineCoords) {
    d3Line.attr('x1', lineCoords.x1)
    d3Line.attr('x2', lineCoords.x2)
    d3Line.attr('y1', lineCoords.y1)
    d3Line.attr('y2', lineCoords.y2)
  }
}

function getDecimalsArray (targetNode) {
  const decimalsArray = []

  if (targetNode.decimals) {
    for (const label of targetNode.decimals.typeCategory.between.keys()) {
      const decimal = targetNode.getDecimal('typeCategory', 'between', label)
      decimalsArray.push([label, decimal])
    }
  } else {
    // Is an aggregateNode with only one type category
    const label = targetNode.typeCategory
    decimalsArray.push([label, 1])
  }

  return decimalsArray
}

module.exports = Links
