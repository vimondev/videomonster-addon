function GetEditableData(targetComp) {
    var scanCount = 0
    function ConvertJSONToArr(obj) {
        function sortFunc(a, b) {
            a = Number(a.toLowerCase().replace('#cut', '').replace('#text', '1000').replace('#av', '1000000'))
            b = Number(b.toLowerCase().replace('#cut', '').replace('#text', '1000').replace('#av', '1000000'))

            return a - b
        }

        var keys = []
        for (var key in obj) {
            var subKeys = []
            for (var subKey in obj[key]) {
                subKeys.push(subKey)
            }
            subKeys.sort(sortFunc)
            obj[key] = subKeys

            keys.push(key)
        }
        keys.sort(sortFunc)

        var newObj = {}
        for (var i = 0; i < keys.length; i++) {
            newObj[keys[i]] = obj[keys[i]]
        }

        return newObj
    }

    function dfs(key, target, obj, visited) {
        var keys = target[key]
        if (!keys) return obj

        for (var i = 0; i < keys.length; i++) {
            var subKey = keys[i]

            if (visited[subKey]) continue;
            visited[subKey] = true

            obj[subKey] = true
            obj = dfs(subKey, target, obj, visited)
        }
        return obj
    }

    function RecursiveScanningProperties(property, depth) {
        var data = {}

        if (depth > 0) {
            data.name = property.name
            data.numKeys = property.numKeys
        }

        var numProperties = property.numProperties
        if (numProperties && numProperties > 0) {
            for (var i = 1; i <= numProperties; i++) {
                var prop = RecursiveScanningProperties(property.property(i), depth + 1)
                if (prop.numKeys && prop.numKeys > 0 || prop.childProps) {
                    if (!data.childProps) data.childProps = []
                    data.childProps.push(prop)
                }
            }
        }

        return data
    }

    function RecursiveScanningLayer(layer) {
        scanCount++
        var obj = {
            name: layer.name,
            enabled: layer.enabled,
            shy: layer.shy,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            startTime: layer.startTime,
            index: layer.index
        }

        if (layer.parent) obj.parent = layer.parent.index
        if (layer.hasTrackMatte) obj.hasTrackMatte = true

        if (layer instanceof AVLayer) {
            obj.layerType = "AVLayer"
            var avItem = layer.source
            if (avItem) {
                obj.name = avItem.name
                if (avItem instanceof CompItem) {
                    obj.compType = "CompItem"
                    if (avItem.layers.length > 0) {
                        obj.childLayers = []
                        for (var i = 1; i <= avItem.layers.length; i++) {
                            obj.childLayers.push(RecursiveScanningLayer(avItem.layers[i]))
                        }
                    }
                }
                if (avItem instanceof FootageItem) {
                    obj.compType = "FootageItem"
                }
            }
        }
        if (layer instanceof CameraLayer) {
            obj.layerType = "CameraLayer"
        }
        if (layer instanceof LightLayer) {
            obj.layerType = "LightLayer"
        }
        if (layer instanceof ShapeLayer) {
            obj.layerType = "ShapeLayer"
        }
        if (layer instanceof TextLayer) {
            obj.layerType = "TextLayer"
        }

        obj.properties = RecursiveScanningProperties(layer, 0).childProps

        return obj
    }

    var layers = targetComp.layers
    var Time = targetComp.workAreaDuration - targetComp.workAreaStart;

    var Scenes = []

    // Scanning All Layer Data
    for (var i = 1; i <= layers.length; i++) {
        var layer = layers[i]
        Scenes.push(RecursiveScanningLayer(layer))
    }

    var isKeyframeExists = false
    var groups = []
    var cutOverlaps = []
    var transitions = []
    var hasParent
    var hasCameraLayer

    var layerMap = {}
    var cutMap = {}
    var replacableCompMap = {}
    var cuts = []
    var trackMatteMap = {}
    var cutContains = []

    // 
    {
        var compositionIncludesMap = {}

        function childLayerDfs(cutName, childLayers) {
            for (var i = 0; i < childLayers.length; i++) {
                var layer = childLayers[i]
                var layerName = layer.name.toLowerCase()

                if (layerName.indexOf('#text') !== -1 || layerName.indexOf('#av') !== -1 || layerName.indexOf('#cut') !== -1) {
                    if (!compositionIncludesMap[layer.name]) compositionIncludesMap[layer.name] = {}
                    compositionIncludesMap[layer.name][cutName] = true
                }

                if (layer.childLayers && layer.childLayers.length) childLayerDfs(cutName, layer.childLayers)
            }
        }

        for (var i = 0; i < Scenes.length; i++) {
            var item = Scenes[i]
            layerMap[item.index] = item
        }

        for (var i = 0; i < Scenes.length; i++) {
            var item = Scenes[i]

            if (item.childLayers && item.childLayers.length) childLayerDfs(item.name, item.childLayers)
            if (item.layerType === 'CameraLayer') hasCameraLayer = true

            if (item.name.toLowerCase().indexOf('#cut') !== -1 && item.enabled && !item.shy) {
                cutMap[item.name] = item
                cuts.push(item)

                if (item.childLayers && item.childLayers.length) {
                    for (var j = 0; j < item.childLayers.length; j++) {
                        var childLayer = item.childLayers[j]
                        var childLayerName = childLayer.name.toLowerCase()
                        if ((childLayerName.indexOf('#text') !== -1 || childLayerName.indexOf('#av') !== -1) && childLayer.enabled && !childLayer.shy) {
                            replacableCompMap[childLayer.name] = true
                        }
                    }
                }

                if (item.hasTrackMatte) {
                    var currentTrackMatte = layerMap[item.index - 1]

                    while (true) {
                        trackMatteMap[currentTrackMatte.index] = currentTrackMatte

                        if (currentTrackMatte.hasTrackMatte) currentTrackMatte = layerMap[currentTrackMatte.index - 1]
                        else break;
                    }
                }
                if (item.hasOwnProperty('parent')) hasParent = true

                if (item.properties && item.properties.length) {
                    var propertyArr = []
                    function propertyDfs(property, str) {
                        if (property.childProps && property.childProps.length) {
                            for (var j = 0; j < property.childProps.length; j++) {
                                var childProperty = property.childProps[j]
                                propertyDfs(childProperty, str + '.' + childProperty.name)
                            }
                        }
                        else propertyArr.push(str)
                    }

                    for (var j = 0; j < item.properties.length; j++) {
                        propertyDfs(item.properties[j], '')
                    }

                    for (var j = 0; j < propertyArr.length; j++) {
                        var propertyName = propertyArr[j].toLowerCase()

                        if (propertyName.indexOf('marker') !== -1) continue;

                        isKeyframeExists = true
                        break;
                    }
                }
            }
        }
        cuts.sort(function (a, b) {
            return a.inPoint - b.inPoint
        })

        var calculatedCompositionIncludesMap = {}
        for (var key in compositionIncludesMap) {
            var subKeys = []
            for (var subKey in compositionIncludesMap[key]) {
                subKeys.push(subKey)
            }
            if ((key.toLowerCase().indexOf('#text') !== -1 || key.toLowerCase().indexOf('#av') !== -1) && subKeys.length <= 1) continue;

            for (var i = 0; i < subKeys.length; i++) {
                for (var j = 0; j < subKeys.length; j++) {
                    if (i === j) continue;

                    if (!calculatedCompositionIncludesMap[subKeys[i]]) calculatedCompositionIncludesMap[subKeys[i]] = {}
                    if (!calculatedCompositionIncludesMap[subKeys[j]]) calculatedCompositionIncludesMap[subKeys[j]] = {}

                    calculatedCompositionIncludesMap[subKeys[i]][subKeys[j]] = true
                    calculatedCompositionIncludesMap[subKeys[j]][subKeys[i]] = true
                }
            }
        }
        calculatedCompositionIncludesMap = ConvertJSONToArr(calculatedCompositionIncludesMap)

        var visited = {}

        for (var key in calculatedCompositionIncludesMap) {
            if (visited[key]) continue;
            visited[key] = true

            var obj = {}
            obj[key] = true

            var group = dfs(key, calculatedCompositionIncludesMap, obj, visited)
            groups.push(group)
        }
    }

    {
        var transitionOverlapMap = {}
        var transitionMap = {}

        for (var i = 0; i < Scenes.length; i++) {
            var layer = Scenes[i]

            if ((layer.name.toLowerCase().indexOf('#cut') !== -1 && !layer.shy)
                || layer.outPoint - layer.inPoint >= Time * 0.9 || trackMatteMap[layer.index]) continue;

            transitionMap[layer.index] = layer

            for (var j = 0; j < Scenes.length; j++) {
                if (i === j) continue;

                var otherLayer = Scenes[j]

                if ((otherLayer.name.toLowerCase().indexOf('#cut') !== -1 && !otherLayer.shy)
                    || otherLayer.outPoint - otherLayer.inPoint >= Time * 0.9 || trackMatteMap[otherLayer.index]) continue;


                if (!(layer.outPoint < otherLayer.inPoint || otherLayer.outPoint < layer.inPoint)) {
                    if (!transitionOverlapMap[layer.index]) transitionOverlapMap[layer.index] = {}
                    if (!transitionOverlapMap[otherLayer.index]) transitionOverlapMap[otherLayer.index] = {}

                    transitionOverlapMap[layer.index][otherLayer.index] = true
                    transitionOverlapMap[otherLayer.index][layer.index] = true
                }
            }
        }

        transitionOverlapMap = ConvertJSONToArr(transitionOverlapMap)

        var groupIndex = 1
        var visited = {}
        for (var index in transitionOverlapMap) {
            if (visited[index]) continue;
            visited[index] = true

            var obj = {}
            obj[index] = true
            var transitionGroup = dfs(index, transitionOverlapMap, obj, visited)

            var minInPoint = 999999, maxOutPoint = -1000

            var transitionLayers = []
            for (var transitionLayerIndex in transitionGroup) {
                var transitionLayer = layerMap[transitionLayerIndex]
                transitionLayers.push({
                    name: transitionLayer.name,
                    index: Number(transitionLayerIndex),
                    inPoint: transitionLayer.inPoint,
                    outPoint: transitionLayer.outPoint
                })

                if (minInPoint > transitionLayer.inPoint) minInPoint = transitionLayer.inPoint
                if (maxOutPoint < transitionLayer.outPoint) maxOutPoint = transitionLayer.outPoint
            }
            transitions.push({
                name: 'GROUP(' + (groupIndex++) + ')',
                groupLayers: transitionLayers,
                inPoint: minInPoint,
                outPoint: maxOutPoint
            })
        }

        for (var index in transitionMap) {
            if (transitionOverlapMap[index]) continue;
            var transitionLayer = transitionMap[index]

            transitions.push({
                name: transitionLayer.name,
                index: Number(index),
                inPoint: transitionLayer.inPoint,
                outPoint: transitionLayer.outPoint
            })
        }
    }

    {
        var cutOverlapMap = {}
        for (var i = 0; i < cuts.length; i++) {
            var layer = cuts[i]

            for (var j = 0; j < cuts.length; j++) {
                if (i === j) continue;

                var otherLayer = cuts[j]

                if (!(layer.outPoint <= otherLayer.inPoint || otherLayer.outPoint <= layer.inPoint)) {
                    if (!cutOverlapMap[layer.name]) cutOverlapMap[layer.name] = {}
                    if (!cutOverlapMap[otherLayer.name]) cutOverlapMap[otherLayer.name] = {}

                    cutOverlapMap[layer.name][otherLayer.name] = true
                    cutOverlapMap[otherLayer.name][layer.name] = true
                }
            }
        }

        cutOverlapMap = ConvertJSONToArr(cutOverlapMap)

        var visited = {}

        for (var key in cutOverlapMap) {
            if (visited[key]) continue;
            visited[key] = true

            var obj = {}
            obj[key] = true

            var group = dfs(key, cutOverlapMap, obj, visited)
            cutOverlaps.push(group)
        }

        var writedMap = {}

        for (var key in cutOverlapMap) {
            if (writedMap[key]) continue;

            var layer = cutMap[key]
            var overlapKeys = []

            for (var i = 0; i < cutOverlapMap[key].length; i++) {
                var subKey = cutOverlapMap[key][i]
                if (key === subKey) continue;
                if (writedMap[subKey]) continue;

                var otherLayer = cutMap[subKey]

                if (layer.inPoint <= otherLayer.inPoint && layer.outPoint >= otherLayer.outPoint) {
                    overlapKeys.push(subKey)
                    writedMap[subKey] = true
                }
            }

            if (overlapKeys.length > 0) {
                cutContains.push({
                    name: key,
                    layers: overlapKeys
                })
            }
        }
    }

    {
        for (var i = 0; i < groups.length; i++) {
            var group = groups[i]

            var minIdx = 999999, maxIdx = -1000
            var minInPoint = 999999, maxOutPoint = -1000

            for (var name in group) {
                if (!cutMap[name]) continue;
                var cut = cutMap[name]

                if (cut.index < minIdx) minIdx = cut.index
                if (cut.index > maxIdx) maxIdx = cut.index

                if (cut.inPoint < minInPoint) minInPoint = cut.inPoint
                if (cut.outPoint > maxOutPoint) maxOutPoint = cut.outPoint
            }

            for (var j = 0; j < cuts.length; j++) {
                var cut = cuts[j];

                if (cut.inPoint >= minInPoint && cut.outPoint <= maxOutPoint) {
                    group[cut.name] = true
                }
            }
        }

        var calculatedCompositionIncludesMap = {}
        for (var i = 0; i < groups.length; i++) {
            var group = groups[i]

            for (var name in group) {
                if (!cutMap[name]) continue;

                calculatedCompositionIncludesMap[name] = JSON.parse(JSON.stringify(group))
                delete calculatedCompositionIncludesMap[name][name]
            }
        }
        calculatedCompositionIncludesMap = ConvertJSONToArr(calculatedCompositionIncludesMap)

        groups = []
        var visited = {}
        for (var key in calculatedCompositionIncludesMap) {
            if (visited[key]) continue;
            visited[key] = true

            var obj = {}
            obj[key] = true

            var group = dfs(key, calculatedCompositionIncludesMap, obj, visited)
            groups.push(group)
        }
    }

    for (var i = 0; i < cuts.length; i++) {
        var cut = cuts[i]
        var beforeCut = cuts[i - 1]
        var nextCut = cuts[i + 1]

        if (nextCut) cut.nextCutOverlapDuration = nextCut.inPoint - cut.outPoint
        if (beforeCut) cut.beforeCutOverlapDuration = cut.inPoint - beforeCut.outPoint
    }

    ///////////////////////////////////////////
    ///////////// DETECT EDITABLE /////////////
    ///////////////////////////////////////////

    var isEditable = true
    var unsupportTypes = {}

    {
        if (cuts[0].inPoint - 0.1 > 0 || cuts[0].isBridge) {
            isEditable = false
            unsupportTypes['1'] = true
        }
        else {
            var maxOutPoint = -1000
            for (var i = 0; i < cuts.length; i++) {
                if (maxOutPoint < cuts[i].outPoint) maxOutPoint = cuts[i].outPoint
            }

            if (Time > maxOutPoint + 0.1) {
                isEditable = false
                unsupportTypes['1'] = true
            }
        }
    }

    {
        for (var i = 0; i < groups.length; i++) {
            var flag = false
            for (var key in groups[i]) {
                if (!cutMap[key]) {
                    flag = true
                    isEditable = false
                    unsupportTypes['2'] = true
                    break;
                }
            }
            if (flag) break;
        }
    }

    {
        if (cutContains.length > 0) {
            isEditable = false
            unsupportTypes['3'] = true
        }
    }

    {
        for (var i = 0; i < transitions.length; i++) {
            var transition = transitions[i]

            var overlapCount = 0
            var isContained = false
            var transitionIsCutOrReplacableComp = false

            for (var j = 0; j < cuts.length; j++) {
                var cut = cuts[j]

                if (!(transition.outPoint <= cut.inPoint || cut.outPoint <= transition.inPoint)) {
                    overlapCount++
                }
                if (transition.inPoint <= cut.inPoint && transition.outPoint >= cut.outPoint) {
                    isContained = true
                    break;
                }
                if (transition.groupLayers) {
                    for (var k = 0; k < transition.groupLayers.length; k++) {
                        var transitionName = transition.groupLayers[k].name

                        if (cutMap[transitionName] || replacableCompMap[transitionName]) {
                            transitionIsCutOrReplacableComp = true
                            break;
                        }
                    }
                }
                else if (cutMap[transition.name] || replacableCompMap[transition.name]) transitionIsCutOrReplacableComp = true
            }

            if (overlapCount >= 3) {
                isEditable = false
                unsupportTypes['4'] = true
                break;
            }
            if (isContained) {
                isEditable = false
                unsupportTypes['5'] = true
                break;
            }
            if (transitionIsCutOrReplacableComp) {
                isEditable = false
                unsupportTypes['6'] = true
                break;
            }
        }
    }

    {
        if (hasParent) {
            isEditable = false
            unsupportTypes['7'] = true
        }
    }

    {
        if (hasCameraLayer) {
            isEditable = false
            unsupportTypes['8'] = true
        }
    }

    {
        for (var i = 0; i < cuts.length; i++) {
            var cut = cuts[i]
            if (cut.beforeCutOverlapDuration > 0.05 || cut.nextCutOverlapDuration > 0.05) {
                isEditable = false
                unsupportTypes['9'] = true
            }
        }
    }

    {
        if (scanCount >= 2000) {
            isEditable = false
            unsupportTypes['10'] = true
        }
    }

    var newCuts = []
    for (var i = 0; i < cuts.length; i++) {
        var cut = cuts[i]
        newCuts.push({
            name: cut.name,
            inPoint: cut.inPoint,
            outPoint: cut.outPoint,
            index: cut.index,
            isBridge: cut.isBridge,
            beforeCutOverlapDuration: cut.beforeCutOverlapDuration,
            nextCutOverlapDuration: cut.nextCutOverlapDuration
        })
    }

    var newGroups = []
    for (var i = 0; i < groups.length; i++) {
        var minIdx = 999999, maxIdx = -1000
        var minInPoint = 999999, maxOutPoint = -1000
        var firstCutName, lastCutName

        for (var compName in groups[i]) {
            var cut = cutMap[compName]
            if (!cut) continue;

            if (minIdx > cut.index) minIdx = Number(cut.index)
            if (maxIdx < cut.index) maxIdx = Number(cut.index)

            if (minInPoint > cut.inPoint) {
                firstCutName = compName
                minInPoint = Number(cut.inPoint)
            }
            if (maxOutPoint < cut.outPoint) {
                lastCutName = compName
                maxOutPoint = Number(cut.outPoint)
            }
        }

        newGroups.push({
            map: groups[i],
            firstCutName: firstCutName,
            lastCutName: lastCutName,
            minIdx: minIdx,
            maxIdx: maxIdx,
            minInPoint: minInPoint,
            maxOutPoint: maxOutPoint
        })
    }

    var type = -1
    if (!transitions || !transitions.length) {
        if (!groups || !groups.length) {
            if (!cutOverlaps || !cutOverlaps.length) type = 1
            else type = 2
        }
        else {
            if (!cutOverlaps || !cutOverlaps.length) type = 3
            else type = 4
        }
    }
    else {
        if (!groups || !groups.length) {
            if (!cutOverlaps || !cutOverlaps.length) type = 5
            else type = 6
        }
        else {
            if (!cutOverlaps || !cutOverlaps.length) type = 7
            else type = 8
        }
    }

    return {
        isEditable: isEditable,
        isKeyframeExists: isKeyframeExists,
        cuts: newCuts,
        groups: newGroups,
        transitions: transitions,
        type: type,
        unsupportTypes: unsupportTypes,
        scanCount: scanCount
    }
}

function SlideCopyAndStretch(targetComp, data, material) {
    if (!targetComp) return
    if (!data.isEditable) return

    var targetLayers = targetComp.layers
    var Time = targetComp.workAreaDuration - targetComp.workAreaStart;

    var Remove = material.Remove || []
    var Copy = material.Copy || []
    var Stretch = material.Stretch || []

    if (Remove.length === 0 && Copy.length === 0 && Stretch.length === 0) return

    var removeMap = {}
    for (var i = 0; i < Remove.length; i++) {
        var item = Remove[i]
        removeMap[item.Composition] = true
        
        for (var j = 0; j < data.groups.length; j++) {
            var group = data.groups[j]
            if (group.map[item.Composition]) {
                for (var otherComp in group.map) {
                    removeMap[otherComp] = true
                }
                break;
            }
        }
    }

    var copyMap = {}
    for (var i = 0; i < Copy.length; i++) {
        var item = Copy[i]
        item.Count = Math.min(2, item.Count)

        copyMap[item.Composition] = item.Count

        for (var j = 0; j < data.groups.length; j++) {
            var group = data.groups[j]
            if (group.map[item.Composition]) {
                for (var otherComp in group.map) {
                    copyMap[otherComp] = item.Count
                }
                break;
            }
        }
    }

    var stretchMap = {}
    for (var i = 0; i < Stretch.length; i++) {
        var item = Stretch[i]
        item.Stretch = Math.min(200, item.Stretch)
        item.Stretch = Math.max(50, item.Stretch)

        stretchMap[item.Composition] = item.Stretch
    }

    var indexMap = {}
    var groupMap = {}
    var overlappedTransitionMap = {
        /*
        #CUT1: {
            '0': true,
            '1': true   // key -> (transitions array index)
        }
        #CUT2: {
            '1': true,
            '2': true
        }
        */
    }
    for (var i = 0; i < data.cuts.length; i++) {
        var cut = data.cuts[i]
        indexMap[cut.name] = Number(cut.index)

        for (var j = 0; j < data.transitions.length; j++) {
            var transition = data.transitions[j]

            if (!(cut.outPoint < transition.inPoint || transition.outPoint < cut.inPoint)) {
                if (!overlappedTransitionMap[cut.name]) overlappedTransitionMap[cut.name] = {}
                overlappedTransitionMap[cut.name][j] = true
            }
        }
    }
    for (var i = 0; i < data.groups.length; i++) {
        var group = data.groups[i]
        for (var compName in group.map) {
            groupMap[compName] = group
        }
    }

    // AVLayer Map
    var originalCutMap = {
        /*
        #CUT1: AVLayer (AVLayer.source => CompItem)
        */
    }
    for (var i = 0; i < data.cuts.length; i++) {
        var cut = data.cuts[i]

        var cutLayer = targetLayers[cut.index]
        var compName = cutLayer.source.name

        var beforeCutNumber = Number(compName.toLowerCase().replace('#cut', '')) - 1
        var nextCutNumber = Number(compName.toLowerCase().replace('#cut', '')) + 1

        var cutName = compName.substring(0, 4)
        var beforeCutName = cutName + beforeCutNumber
        var nextCutName = cutName + nextCutNumber

        var originCutIndex = Number(cut.index)
        var beforeCutIndex = indexMap[beforeCutName] || -1
        var nextCutIndex = indexMap[nextCutName] || -1

        var originTrackMattes = []
        if (cutLayer.hasTrackMatte) {
            var currentTrackMatteLayer = targetLayers[cutLayer.index - 1]
            while (true) {
                originTrackMattes.push(currentTrackMatteLayer)

                if (currentTrackMatteLayer.hasTrackMatte) currentTrackMatteLayer = targetLayers[currentTrackMatteLayer.index - 1]
                else break;
            }
        }

        var originTransitions = []
        if (overlappedTransitionMap[compName]) {
            for (var idx in overlappedTransitionMap[compName]) {
                if (overlappedTransitionMap[nextCutName] && overlappedTransitionMap[nextCutName][idx] && originCutIndex > nextCutIndex) continue;
                if (overlappedTransitionMap[beforeCutName] && overlappedTransitionMap[beforeCutName][idx] && originCutIndex > beforeCutIndex) continue;

                var transition = data.transitions[Number(idx)]
                if (transition) {
                    if (transition.groupLayers && transition.groupLayers.length) {
                        for (var j = 0; j < transition.groupLayers.length; j++) {
                            originTransitions.push({
                                index: Number(transition.groupLayers[j].index),
                                layer: targetLayers[transition.groupLayers[j].index]
                            })
                        }
                    }
                    else {
                        originTransitions.push({
                            index: Number(transition.index),
                            layer: targetLayers[transition.index]
                        })
                    }
                }
            }
        }

        originalCutMap[compName] = {
            cut: cutLayer,
            trackMattes: originTrackMattes,
            transitions: originTransitions,
            originCutIndex: originCutIndex,
            beforeCutIndex: beforeCutIndex,
            nextCutIndex: nextCutIndex,
            nextCutOverlapDuration: cut.nextCutOverlapDuration,
            beforeCutOverlapDuration: cut.beforeCutOverlapDuration
        }
    }
    
    for (var compName in originalCutMap) {
        var cutData = originalCutMap[compName]
        
        var cutLayer = cutData.cut
        var trackMattes = cutData.trackMattes
        var transitions = cutData.transitions

        cutLayer.locked = false
        for (var j = 0; j < trackMattes.length; j++) {
            trackMattes[j].locked = false
        }
        for (var j = 0; j < transitions.length; j++) {
            transitions[j].layer.locked = false
        }
    }

    var copiedOriginCutMap = {
        /*
        #CUT1: AVLayer (AVLayer.source => CompItem)
        */
    }
    var copiedNewCutMap = {
        /*
        #CUT1: {
            #CUT1-1: AVLayer,
            #CUT1-2: AVLayer
        }
        */
    }

    var copiedOriginReplaceCompMap = {
        /*
        #TEXT1: CompItem,
        #AV1: CompItem
        */
    }
    var copiedNewReplaceCompMap = {
        /*
        #TEXT1: {
            #TEXT1-1: CompItem,
            #TEXT1-2: CompItem
        },
        #AV1: {
            #AV1-1: CompItem,
            #AV1-2: CompItem
        }
        */
    }

    var copiedOriginOtherCompMap = {
        /*
        T3 Comp: CompItem
        */
    }
    var copiedNewOtherCompMap = {
        /*
        T3 Comp: {
            T3 Comp-1: CompItem
        }
        */
    }

    var frameOrAudioLayers = []

    for (var i = 1; i <= targetLayers.length; i++) {
        var layer = targetLayers[i]
        var layerName = layer.name
        layer.locked = false

        if (layerName.toLowerCase().indexOf('#cut') !== -1 && layer.enabled && !layer.shy) {
            var comp = layer.source
            if (comp instanceof CompItem) {
                var compName = comp.name

                if (copyMap[compName] && !copiedOriginCutMap[compName] && originalCutMap[compName]) {
                    var cutData = originalCutMap[compName]

                    var originCutIndex = cutData.originCutIndex
                    var beforeCutIndex = cutData.beforeCutIndex
                    var nextCutIndex = cutData.nextCutIndex
                    var originTrackMattes = cutData.trackMattes
                    var originTransitions = cutData.transitions

                    for (var j = copyMap[compName]; j >= 1; j--) {
                        var newLayer = layer.duplicate()

                        if (nextCutIndex !== -1 && originCutIndex < nextCutIndex || beforeCutIndex !== -1 && originCutIndex > beforeCutIndex) {
                            var afterTransition = null
                            for (var k = 0; k < originTransitions.length; k++) {
                                var originTransition = originTransitions[k]
                                if (originCutIndex < originTransition.index) {
                                    if (!afterTransition || afterTransition.index < originTransition.index) {
                                        afterTransition = originTransition
                                    }
                                }
                            }

                            if (afterTransition) newLayer.moveAfter(afterTransition.layer)
                            else newLayer.moveAfter(layer)
                        }
                        if (nextCutIndex !== -1 && originCutIndex > nextCutIndex || beforeCutIndex !== -1 && originCutIndex < beforeCutIndex) {
                            if (originTrackMattes.length > 0) newLayer.moveBefore(originTrackMattes[originTrackMattes.length - 1])
                            else newLayer.moveBefore(layer)
                        }

                        // #CUT1 -> #CUT1-1
                        var newComp = comp.duplicate()
                        newComp.name = comp.name + '-' + j

                        newLayer.replaceSource(newComp, false)

                        var newTrackMattes = []
                        for (var k = originTrackMattes.length - 1; k >= 0; k--) {
                            var newTrackMatteLayer = originTrackMattes[k].duplicate()
                            newTrackMatteLayer.moveBefore(newLayer)
                            newTrackMattes.push(newTrackMatteLayer)
                        }

                        var newTransitions = []
                        for (var k = originTransitions.length - 1; k >= 0; k--) {
                            var originTransition = originTransitions[k]

                            var newTransitionLayer = originTransition.layer.duplicate()
                            newTransitionLayer.moveBefore(originTransition.layer)
                            newTransitions.push({
                                layer: newTransitionLayer
                            })

                            if (originTransition.index > originCutIndex) newTransitionLayer.moveAfter(newLayer)
                        }

                        if (!copiedNewCutMap[compName]) copiedNewCutMap[compName] = {}
                        copiedNewCutMap[compName][newComp.name] = {
                            cut: newLayer,
                            trackMattes: newTrackMattes,
                            transitions: newTransitions
                        }

                        if (!copiedNewOtherCompMap[compName]) copiedNewOtherCompMap[compName] = {}
                        copiedNewOtherCompMap[compName][newComp.name] = newComp

                        var newCompLayers = newComp.layers
                        for (var k = 1; k <= newCompLayers.length; k++) {
                            var childLayer = newCompLayers[k]
                            var childLayerComp = childLayer.source

                            childLayer.locked = false

                            if (childLayerComp instanceof CompItem) {
                                var sourceLayer = childLayerComp.layer('@Source')
                                if (sourceLayer instanceof TextLayer || sourceLayer instanceof AVLayer) {
                                    // #TEXT1 -> #TEXT1-1
                                    // #AV2 -> #AV2-1
                                    var newChildCompName = childLayerComp.name + '-' + j
                                    var newChildComp

                                    if (!copiedNewReplaceCompMap[childLayerComp.name] || !copiedNewReplaceCompMap[childLayerComp.name][newChildCompName]) {
                                        newChildComp = childLayerComp.duplicate()
                                        newChildComp.name = newChildCompName

                                        copiedOriginReplaceCompMap[childLayerComp.name] = childLayerComp

                                        if (!copiedNewReplaceCompMap[childLayerComp.name]) copiedNewReplaceCompMap[childLayerComp.name] = {}
                                        copiedNewReplaceCompMap[childLayerComp.name][newChildCompName] = newChildComp
                                    }
                                    else newChildComp = copiedNewReplaceCompMap[childLayerComp.name][newChildCompName]

                                    childLayer.name = newChildCompName
                                    childLayer.replaceSource(newChildComp, false)
                                }
                            }
                        }
                    }
                    copiedOriginCutMap[compName] = layer
                    copiedOriginOtherCompMap[compName] = layer.source
                }
            }
        }
        else if (layer.outPoint - layer.inPoint >= Time * 0.9) frameOrAudioLayers.push(layer)
    }

    function ReplaceExpression(property, idx) {
        if (property.expression) {
            var comps = []

            for (var compName in copiedOriginCutMap) {
                comps.push(compName)
            }
            for (var compName in copiedOriginReplaceCompMap) {
                comps.push(compName)
            }
            for (var compName in copiedOriginOtherCompMap) {
                comps.push(compName)
            }

            for (var i = 0; i < comps.length; i++) {
                var compName = comps[i]
                var quotes = ['\'', '"', '`']
                for (var j = 0; j < quotes.length; j++) {
                    var quote = quotes[j]
                    var targetExpression = 'comp(' + quote + compName + quote + ')'
                    while (property.expression.indexOf(targetExpression) !== -1) {
                        property.expression = property.expression.replace(targetExpression, targetExpression.replace(compName, compName + '-' + idx))
                    }
                }
            }
        }
    }

    function RecursiveScanningProperties(property, idx) {
        var numProperties = property.numProperties
        if (numProperties && numProperties > 0) {
            for (var i = 1; i <= numProperties; i++) {
                RecursiveScanningProperties(property.property(i), idx)
            }
        }
        ReplaceExpression(property, idx)
    }

    function RecursiveCheckIsNeedCopy(layer) {
        var flag = false
        if (layer instanceof AVLayer) {
            var comp = layer.source
            if (comp instanceof CompItem) {
                var childLayers = comp.layers
                if (childLayers.length > 0) {
                    for (var i = 1; i <= childLayers.length; i++) {
                        flag = flag || RecursiveCheckIsNeedCopy(childLayers[i])
                    }
                }

                var originName = layer.name
                if (copiedOriginReplaceCompMap[originName]) flag = true
            }
        }
        return flag
    }

    function RecursiveScanningLayer(layer, idx) {
        if (layer instanceof AVLayer) {
            var avItem = layer.source
            if (avItem) {
                if (avItem instanceof CompItem) {
                    var childLayers = avItem.layers
                    if (childLayers.length > 0) {
                        for (var i = 1; i <= childLayers.length; i++) {
                            var childLayer = childLayers[i]

                            var childLayerComp = childLayer.source
                            if (childLayerComp instanceof CompItem && RecursiveCheckIsNeedCopy(childLayer)) {
                                var newChildCompName = childLayerComp.name + '-' + idx
                                var newChildComp

                                if (!copiedNewOtherCompMap[childLayerComp.name] || !copiedNewOtherCompMap[childLayerComp.name][newChildCompName]) {
                                    newChildComp = childLayerComp.duplicate()
                                    newChildComp.name = newChildCompName

                                    copiedOriginOtherCompMap[childLayerComp.name] = childLayerComp

                                    if (!copiedNewOtherCompMap[childLayerComp.name]) copiedNewOtherCompMap[childLayerComp.name] = {}
                                    copiedNewOtherCompMap[childLayerComp.name][newChildCompName] = newChildComp

                                    var newChildLayerCompLayers = newChildComp.layers
                                    for (var j = 1; j <= newChildLayerCompLayers.length; j++) {
                                        var childLayerCompLayer = newChildLayerCompLayers[j]
                                        var originName = childLayerCompLayer.name
                                        var newName = originName + '-' + idx

                                        if (copiedOriginReplaceCompMap[originName] && childLayerCompLayer.source instanceof CompItem) {
                                            if (copiedNewReplaceCompMap[originName][newName]) {
                                                childLayerCompLayer.replaceSource(copiedNewReplaceCompMap[originName][newName], false)
                                            }
                                        }
                                    }
                                }
                                else newChildComp = copiedNewOtherCompMap[childLayerComp.name][newChildCompName]

                                childLayer.replaceSource(newChildComp, false)
                            }

                            RecursiveScanningLayer(childLayer, idx)
                        }
                    }
                }
            }
        }
        RecursiveScanningProperties(layer, idx)
    }

    for (var compName in copiedOriginCutMap) {
        for (var i = 1; i <= copyMap[compName]; i++) {
            var newCompName = compName + '-' + i
            var newCut = copiedNewCutMap[compName][newCompName].cut

            RecursiveScanningLayer(newCut, i)
        }
    }

    function sortLayers(cutDatas) {
        var layers = []
        for (var i = 0; i < cutDatas.length; i++) {
            var cutData = cutDatas[i]

            var cutLayer = cutData.cut
            var trackMattes = cutData.trackMattes
            var transitions = cutData.transitions

            layers.push(cutLayer)
            for (var j = 0; j < trackMattes.length; j++) {
                layers.push(trackMattes[j])
            }
            for (var j = 0; j < transitions.length; j++) {
                layers.push(transitions[j].layer)
            }
        }
        layers.sort(function (a, b) { return a.index - b.index })

        if (layers.length > 0) {
            var lastLayer = layers[layers.length - 1]
            for (var i = 0; i < layers.length - 1; i++) {
                layers[i].moveBefore(lastLayer)
            }
        }
    }

    function addDurationToLayers(cutData, additionalDuration, isSort) {
        if (!cutData) return

        if (!isNaN(additionalDuration) && additionalDuration !== 0) {
            var cutLayer = cutData.cut
            var trackMattes = cutData.trackMattes
            var transitions = cutData.transitions
    
            cutLayer.startTime += additionalDuration
            for (var j = 0; j < trackMattes.length; j++) {
                trackMattes[j].startTime += additionalDuration
            }
            for (var j = 0; j < transitions.length; j++) {
                transitions[j].layer.startTime += additionalDuration
            }
        }

        if (isSort) sortLayers([cutData])
    }

    function removeLayers(cutData) {
        if (!cutData) return
        
        var cutLayer = cutData.cut
        var trackMattes = cutData.trackMattes
        var transitions = cutData.transitions

        for (var j = 0; j < transitions.length; j++) {
            transitions[j].layer.remove()
        }
        for (var j = 0; j < trackMattes.length; j++) {
            trackMattes[j].remove()
        }
        cutLayer.remove()
    }

    var removeAdditionalDuration = 0
    for (var i = 0; i < data.cuts.length; i++) {
        var cut = data.cuts[i]
        var compName = cut.name
        
        var cutData = originalCutMap[compName]
        addDurationToLayers(cutData, removeAdditionalDuration, false)

        if (removeMap[compName]) {
            var beforeCut = data.cuts[i - 1]
            var nextCut = data.cuts[i + 1]

            var cutLayer = cutData.cut
            var beforeCutLayer = beforeCut ? originalCutMap[beforeCut.name].cut : null
            var nextCutLayer = nextCut ? originalCutMap[nextCut.name].cut : null

            if (beforeCutLayer && nextCutLayer) {
                removeAdditionalDuration -= (nextCutLayer.inPoint - beforeCutLayer.outPoint + nextCut.beforeCutOverlapDuration)
            }
            else if (nextCutLayer) {
                removeAdditionalDuration -= ((nextCutLayer.inPoint + removeAdditionalDuration) - cutLayer.inPoint)
            }
            else if (beforeCutLayer) {
                removeAdditionalDuration -= (cutLayer.outPoint - beforeCutLayer.outPoint)
            }
            else continue;

            removeLayers(cutData)
            data.cuts.splice(i, 1)
            i--
        }
    }

    var copyAdditionalDuration = 0
    var isCopiedMap = {}
    for (var i = 0; i < data.cuts.length; i++) {
        var cut = data.cuts[i]
        var compName = cut.name

        if (isCopiedMap[compName]) continue;
        isCopiedMap[compName] = true

        var group = groupMap[compName]
        if (group) {
            var nextCutOverlapDuration = originalCutMap[group.lastCutName].nextCutOverlapDuration
            var beforeCutOverlapDuration = originalCutMap[group.firstCutName].beforeCutOverlapDuration
            var newGroupLayerAdditionalDuration = group.maxOutPoint - group.minInPoint

            if (!isNaN(nextCutOverlapDuration)) newGroupLayerAdditionalDuration += nextCutOverlapDuration
            else if (!isNaN(beforeCutOverlapDuration)) newGroupLayerAdditionalDuration += beforeCutOverlapDuration

            var originGroupCutDatas = []
            var newGroupCutDatas = {}
            for (var groupCompName in group.map) {
                isCopiedMap[groupCompName] = true
                var cutData = originalCutMap[groupCompName]

                addDurationToLayers(cutData, copyAdditionalDuration, true)
                originGroupCutDatas.push(cutData)

                for (var j = 1; j <= copyMap[groupCompName]; j++) {
                    var newCompName = groupCompName + '-' + j
                    var newCutData = copiedNewCutMap[groupCompName][newCompName]

                    addDurationToLayers(newCutData, copyAdditionalDuration + newGroupLayerAdditionalDuration * j, true)

                    if (!newGroupCutDatas[j]) newGroupCutDatas[j] = []
                    newGroupCutDatas[j].push(newCutData)
                }
            }
            sortLayers(originGroupCutDatas)

            for (var newGroupIdx in newGroupCutDatas) {
                sortLayers(newGroupCutDatas[newGroupIdx])
                copyAdditionalDuration += newGroupLayerAdditionalDuration
            }
        }
        else {
            var cutData = originalCutMap[compName]
            var cutLayer = cutData.cut

            var nextCutOverlapDuration = cutData.nextCutOverlapDuration
            var beforeCutOverlapDuration = cutData.beforeCutOverlapDuration

            addDurationToLayers(cutData, copyAdditionalDuration, true)

            for (var j = 1; j <= copyMap[compName]; j++) {
                var newCompName = compName + '-' + j
                var newCutData = copiedNewCutMap[compName][newCompName]

                if (!isNaN(nextCutOverlapDuration)) copyAdditionalDuration += nextCutOverlapDuration
                else if (!isNaN(beforeCutOverlapDuration)) copyAdditionalDuration += beforeCutOverlapDuration
                copyAdditionalDuration += cutLayer.outPoint - cutLayer.inPoint

                addDurationToLayers(newCutData, copyAdditionalDuration, true)
            }
        }
    }

    function stretchToLayers(cutData, stretch) {
        if (!cutData || isNaN(stretch) || stretch === 100) return 0

        var cutLayer = cutData.cut
        var trackMattes = cutData.trackMattes
        var transitions = cutData.transitions
        
        var originDuration = cutLayer.outPoint - cutLayer.inPoint
        var calculatedPercentage = stretch / 100

        function stretchLayer(layer, percentage, relativePos) {
            var originInPoint = Number(layer.inPoint)

            layer.stretch *= percentage
            if (layer.inPoint !== originInPoint) layer.startTime -= (layer.inPoint - originInPoint)

            if (!isNaN(relativePos) && relativePos !== 0) layer.startTime += (relativePos * percentage) - relativePos
        }

        stretchLayer(cutLayer, calculatedPercentage, null)
        for (var i = 0; i < trackMattes.length; i++) {
            var trackMatte = trackMattes[i]
            var relativePos = trackMatte.inPoint - cutLayer.inPoint

            stretchLayer(trackMatte, calculatedPercentage, relativePos)
        }
        for (var i = 0; i < transitions.length; i++) {
            var transition = transitions[i].layer
            var relativePos = transition.inPoint - cutLayer.inPoint

            stretchLayer(transition, calculatedPercentage, relativePos)
        }

        return (originDuration * calculatedPercentage) - originDuration
    }

    var stretchAdditionalDuration = 0
    var isStretchedMap = {}
    for (var i = 0; i < data.cuts.length; i++) {
        var cut = data.cuts[i]
        var compName = cut.name
        
        if (isStretchedMap[compName]) continue;
        isStretchedMap[compName] = true

        var group = groupMap[compName]
        if (group) {
            for (var groupCompName in group.map) {
                isStretchedMap[groupCompName] = true
                var cutData = originalCutMap[groupCompName]

                addDurationToLayers(cutData, stretchAdditionalDuration, false)
                if (stretchMap[groupCompName]) stretchAdditionalDuration += stretchToLayers(cutData, stretchMap[groupCompName])
            }
            for (var j = 1; j <= copyMap[compName]; j++) {
                for (var groupCompName in group.map) {
                    var newCompName = groupCompName + '-' + j
                    var newCutData = copiedNewCutMap[groupCompName][newCompName]
    
                    addDurationToLayers(newCutData, stretchAdditionalDuration, false)
                    if (stretchMap[newCompName]) stretchAdditionalDuration += stretchToLayers(newCutData, stretchMap[newCompName])
                }
            }
        }
        else {
            var cutData = originalCutMap[compName]

            addDurationToLayers(cutData, stretchAdditionalDuration, false)
            if (stretchMap[compName]) stretchAdditionalDuration += stretchToLayers(cutData, stretchMap[compName])
    
            for (var j = 1; j <= copyMap[compName]; j++) {
                var newCompName = compName + '-' + j
                var newCutData = copiedNewCutMap[compName][newCompName]

                addDurationToLayers(newCutData, stretchAdditionalDuration, false)
                if (stretchMap[newCompName]) stretchAdditionalDuration += stretchToLayers(newCutData, stretchMap[newCompName])
            }
        }
    }

    var totalAdditionalDuration = removeAdditionalDuration + copyAdditionalDuration + stretchAdditionalDuration
    targetComp.duration += totalAdditionalDuration
    targetComp.workAreaDuration = Math.min(targetComp.duration, targetComp.workAreaDuration + totalAdditionalDuration)

    for (var i = 0; i < frameOrAudioLayers.length; i++) {
        var layer = frameOrAudioLayers[i]
        var layerTime = layer.outPoint - layer.inPoint
        var additionalLayerTime = 0

        var remainDuration = Time + totalAdditionalDuration
        while (remainDuration > layerTime) {
            var newLayer = layer.duplicate()
            newLayer.startTime += layerTime + additionalLayerTime

            remainDuration -= layerTime
            additionalLayerTime += layerTime
        }
    }
}