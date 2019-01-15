import { NumberController } from "../src/controllers/NumberController";
import { expect } from 'chai';
import 'mocha'
import { KeyController } from "../src/controllers/KeyController";
import { DocumentController } from "../src/controllers/DocumentController";
import { autorun, reaction } from "mobx";
import { DocumentReferenceController } from "../src/controllers/DocumentReferenceController";
import { TextController } from "../src/controllers/TextController";
import { FieldController } from "../src/controllers/FieldController";

describe('Number Controller', () => {
    it('Should be constructable', () => {
        const numController = new NumberController(15);
        expect(numController.Data).to.equal(15);
    });

    it('Should update', () => {
        const numController = new NumberController(15);
        let ran = false;
        reaction(() => numController.Data, (data) => {ran = true;})
        expect(ran).to.equal(false);
        numController.Data = 5;
        expect(ran).to.equal(true);
    });
});

describe("Document", () =>{
    it('should hold fields', () => {
        let key = new KeyController("Test");
        let key2 = new KeyController("Test2");
        let field = new NumberController(15);
        let doc = new DocumentController();
        doc.SetField(key, field);
        let getField = doc.GetFieldT(key, NumberController);
        let getField2 = doc.GetFieldT(key2, NumberController);
        expect(getField).to.equal(field);
        expect(getField2).to.equal(undefined);
    });

    it('should update', () => {
        let doc = new DocumentController();
        let key = new KeyController("Test");
        let ran = false;
        reaction(() => doc.GetField(key), (field) => {ran = true});
        expect(ran).to.equal(false);

        doc.SetField(key, new NumberController(5));

        expect(ran).to.equal(true);
    });
});

describe("Reference", () => {
    it('should dereference', () => {
        let doc = new DocumentController();
        let doc2 = new DocumentController();
        const key = new KeyController("test");
        const key2 = new KeyController("test2");

        const numCont = new NumberController(55);
        doc.SetField(key, numCont);
        let ref = new DocumentReferenceController(doc, key);
        let ref2 = new DocumentReferenceController(doc, key2);
        doc2.SetField(key2, ref);

        let ref3 = new DocumentReferenceController(doc2, key2);
        let ref4 = new DocumentReferenceController(doc2, key);
        
        expect(ref.Dereference()).to.equal(numCont);
        expect(ref.DereferenceToRoot()).to.equal(numCont);
        expect(ref2.Dereference()).to.equal(undefined);
        expect(ref2.DereferenceToRoot()).to.equal(undefined);
        expect(ref3.Dereference()).to.equal(ref);
        expect(ref3.DereferenceToRoot()).to.equal(numCont);
        expect(ref4.Dereference()).to.equal(undefined);
        expect(ref4.DereferenceToRoot()).to.equal(undefined);
    });
    
    it('should work with prototypes', () => {
        let doc = new DocumentController;
        let doc2 = doc.MakeDelegate();
        let key = new KeyController("test");
        expect(doc.GetField(key)).to.equal(undefined);
        expect(doc2.GetField(key)).to.equal(undefined);
        let num = new NumberController(55);
        let num2 = new NumberController(56);

        doc.SetField(key, num);
        expect(doc.GetField(key)).to.equal(num);
        expect(doc2.GetField(key)).to.equal(num);

        doc2.SetField(key, num2);
        expect(doc.GetField(key)).to.equal(num);
        expect(doc2.GetField(key)).to.equal(num2);
    });

    it('should update through layers', () => {
        let doc = new DocumentController();
        let doc2 = new DocumentController();
        let doc3 = new DocumentController();
        const key = new KeyController("test");
        const key2 = new KeyController("test2");
        const key3 = new KeyController("test3");

        const numCont = new NumberController(55);
        doc.SetField(key, numCont);
        const ref = new DocumentReferenceController(doc, key);
        doc2.SetField(key2, ref);
        const ref3 = new DocumentReferenceController(doc2, key2);
        doc3.SetField(key3, ref3);

        let ran = false;
        reaction(() => {
            let field = (<FieldController>(<FieldController>doc3.GetField(key3)).DereferenceToRoot()).GetValue();
            return field;
        }, (field) => {
            ran = true;
        });
        expect(ran).to.equal(false);

        numCont.Data = 44;
        expect(ran).to.equal(true);
        ran = false;

        doc.SetField(key, new NumberController(33));
        expect(ran).to.equal(true);
        ran = false;

        doc.SetField(key2, new NumberController(4));
        expect(ran).to.equal(false);

        doc2.SetField(key2, new TextController("hello"));
        expect(ran).to.equal(true);
        ran = false;

        doc3.SetField(key3, new TextController("world"));
        expect(ran).to.equal(true);
        ran = false;
    });

    it('should update with prototypes', () => {
        let doc = new DocumentController();
        let doc2 = doc.MakeDelegate();
        const key = new KeyController("test");

        const numCont = new NumberController(55);

        let ran = false;
        reaction(() => {
            let field = doc2.GetFieldT(key, NumberController);
            if(field) {
                return field.Data;
            }
            return undefined;
        }, (field) => {
            ran = true;
        });
        expect(ran).to.equal(false);

        doc.SetField(key, numCont);
        expect(ran).to.equal(true);

        ran = false;
        numCont.Data = 1;
        expect(ran).to.equal(true);
    });
});