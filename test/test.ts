import { NumberField } from "../src/fields/NumberField";
import { expect } from 'chai';
import 'mocha'
import { Key } from "../src/fields/Key";
import { Document } from "../src/fields/Document";
import { autorun, reaction } from "mobx";
import { DocumentReference } from "../src/fields/DocumentReference";
import { TextField } from "../src/fields/TextField";
import { Field } from "../src/fields/Field";

describe('Number Controller', () => {
    it('Should be constructable', () => {
        const numController = new NumberField(15);
        expect(numController.Data).to.equal(15);
    });

    it('Should update', () => {
        const numController = new NumberField(15);
        let ran = false;
        reaction(() => numController.Data, (data) => { ran = true; })
        expect(ran).to.equal(false);
        numController.Data = 5;
        expect(ran).to.equal(true);
    });
});

describe("Document", () => {
    it('should hold fields', () => {
        let key = new Key("Test");
        let key2 = new Key("Test2");
        let field = new NumberField(15);
        let doc = new Document();
        doc.SetField(key, field);
        let getField = doc.GetFieldT(key, NumberField);
        let getField2 = doc.GetFieldT(key2, NumberField);
        expect(getField).to.equal(field);
        expect(getField2).to.equal(undefined);
    });

    it('should update', () => {
        let doc = new Document();
        let key = new Key("Test");
        let key2 = new Key("Test2");
        let ran = false;
        reaction(() => doc.GetField(key), (field) => { ran = true });
        expect(ran).to.equal(false);

        doc.SetField(key2, new NumberField(4));
        expect(ran).to.equal(false);

        doc.SetField(key, new NumberField(5));

        expect(ran).to.equal(true);
    });
});

describe("Reference", () => {
    it('should dereference', () => {
        let doc = new Document();
        let doc2 = new Document();
        const key = new Key("test");
        const key2 = new Key("test2");

        const numCont = new NumberField(55);
        doc.SetField(key, numCont);
        let ref = new DocumentReference(doc, key);
        let ref2 = new DocumentReference(doc, key2);
        doc2.SetField(key2, ref);

        let ref3 = new DocumentReference(doc2, key2);
        let ref4 = new DocumentReference(doc2, key);

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
        let doc = new Document;
        let doc2 = doc.MakeDelegate();
        let key = new Key("test");
        expect(doc.GetField(key)).to.equal(undefined);
        expect(doc2.GetField(key)).to.equal(undefined);
        let num = new NumberField(55);
        let num2 = new NumberField(56);

        doc.SetField(key, num);
        expect(doc.GetField(key)).to.equal(num);
        expect(doc2.GetField(key)).to.equal(num);

        doc2.SetField(key, num2);
        expect(doc.GetField(key)).to.equal(num);
        expect(doc2.GetField(key)).to.equal(num2);
    });

    it('should update through layers', () => {
        let doc = new Document();
        let doc2 = new Document();
        let doc3 = new Document();
        const key = new Key("test");
        const key2 = new Key("test2");
        const key3 = new Key("test3");

        const numCont = new NumberField(55);
        doc.SetField(key, numCont);
        const ref = new DocumentReference(doc, key);
        doc2.SetField(key2, ref);
        const ref3 = new DocumentReference(doc2, key2);
        doc3.SetField(key3, ref3);

        let ran = false;
        reaction(() => {
            let field = (<Field>(<Field>doc3.GetField(key3)).DereferenceToRoot()).GetValue();
            return field;
        }, (field) => {
            ran = true;
        });
        expect(ran).to.equal(false);

        numCont.Data = 44;
        expect(ran).to.equal(true);
        ran = false;

        doc.SetField(key, new NumberField(33));
        expect(ran).to.equal(true);
        ran = false;

        doc.SetField(key2, new NumberField(4));
        expect(ran).to.equal(false);

        doc2.SetField(key2, new TextField("hello"));
        expect(ran).to.equal(true);
        ran = false;

        doc3.SetField(key3, new TextField("world"));
        expect(ran).to.equal(true);
        ran = false;
    });

    it('should update with prototypes', () => {
        let doc = new Document();
        let doc2 = doc.MakeDelegate();
        const key = new Key("test");

        const numCont = new NumberField(55);

        let ran = false;
        reaction(() => {
            let field = doc2.GetFieldT(key, NumberField);
            if (field) {
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