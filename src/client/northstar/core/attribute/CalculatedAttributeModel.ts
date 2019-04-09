import { BackendAttributeModel, AttributeModel, CodeAttributeModel } from "./AttributeModel";
import { DataType, VisualizationHint } from '../../model/idea/idea'

export class CalculatedAttributeManager {
    public static AllCalculatedAttributes: Array<AttributeModel> = new Array<AttributeModel>();

    public static Clear() {
        this.AllCalculatedAttributes = new Array<AttributeModel>();
    }

    public static CreateBackendAttributeModel(id: string, dataType: DataType, displayName: string, codeName: string, visualizationHints: VisualizationHint[]): BackendAttributeModel {
        var filtered = this.AllCalculatedAttributes.filter(am => {
            if (am instanceof BackendAttributeModel &&
                am.Id === id) {
                return true;
            }
            return false;
        });
        if (filtered.length > 0) {
            return filtered[0] as BackendAttributeModel;
        }
        var newAttr = new BackendAttributeModel(id, dataType, displayName, codeName, visualizationHints);
        this.AllCalculatedAttributes.push(newAttr);
        return newAttr;
    }

    public static CreateCodeAttributeModel(code: string, codeName: string, visualizationHints: VisualizationHint[]): CodeAttributeModel {
        var filtered = this.AllCalculatedAttributes.filter(am => {
            if (am instanceof CodeAttributeModel &&
                am.CodeName === codeName) {
                return true;
            }
            return false;
        });
        if (filtered.length > 0) {
            return filtered[0] as CodeAttributeModel;
        }
        var newAttr = new CodeAttributeModel(code, codeName, codeName.ReplaceAll("_", " "), visualizationHints);
        this.AllCalculatedAttributes.push(newAttr);
        return newAttr;
    }
}