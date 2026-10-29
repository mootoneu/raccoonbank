package com.cochonbank2.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LegacyCategoryGroupsMigratorTest {

    @TempDir
    Path tempDir;

    private final LegacyCategoryGroupsMigrator migrator = new LegacyCategoryGroupsMigrator();

    @Test
    void makesGroupsExplicitAndMultipliesCategoryIds() throws IOException {
        Files.writeString(tempDir.resolve("categories.csv"),
                "Id,Name,Color\n"
                        + "0,Inconnu,#FFFFFF\n"
                        + "40,Loisir,#008080\n"
                        + "43,Ordinateur,#32bdbc\n"
                        + "50,Maison,#ff8c00\n"
                        + "51,Meuble,#ffac43\n",
                StandardCharsets.UTF_8);
        Files.writeString(tempDir.resolve("transactions.csv"),
                "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id\n"
                        + "1,43,DEBIT,-999.00,2026-10-13,2026-10-12,ORDINATEUR,,INV-1\n"
                        + "2,0,CREDIT,10.00,2026-10-14,2026-10-14,VIREMENT,,\n"
                        + "3,,DEBIT,-1.00,2026-10-15,2026-10-15,SANS CATEGORIE,,\n",
                StandardCharsets.UTF_8);
        Files.writeString(tempDir.resolve("defaultcategories.csv"),
                "Id,Category_Id,Pattern,Description\n"
                        + "1,43,ORDINATEUR,New laptop\n"
                        + "2,50,MAISON,\n",
                StandardCharsets.UTF_8);

        assertTrue(migrator.migrate(tempDir));

        List<String> categories = Files.readAllLines(
                tempDir.resolve("categories.csv"), StandardCharsets.UTF_8);
        assertEquals("Id,GroupId,SubId,GroupName,Name,Color", categories.get(0));
        assertEquals("0,0,0,Inconnu,Inconnu,#FFFFFF", categories.get(1));
        assertEquals("400,4,0,Loisir,Loisir,#008080", categories.get(2));
        assertEquals("430,4,30,Loisir,Ordinateur,#32bdbc", categories.get(3));
        assertEquals("500,5,0,Maison,Maison,#ff8c00", categories.get(4));
        assertEquals("510,5,10,Maison,Meuble,#ffac43", categories.get(5));

        List<String> transactions = Files.readAllLines(
                tempDir.resolve("transactions.csv"), StandardCharsets.UTF_8);
        assertEquals("Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id",
                transactions.get(0));
        assertEquals("1,430,DEBIT,-999.00,2026-10-13,2026-10-12,ORDINATEUR,,INV-1",
                transactions.get(1));
        assertEquals("2,0,CREDIT,10.00,2026-10-14,2026-10-14,VIREMENT,,", transactions.get(2));
        assertEquals("3,,DEBIT,-1.00,2026-10-15,2026-10-15,SANS CATEGORIE,,",
                transactions.get(3));

        List<String> rules = Files.readAllLines(
                tempDir.resolve("defaultcategories.csv"), StandardCharsets.UTF_8);
        assertEquals("Id,Category_Id,Pattern,Description", rules.get(0));
        assertEquals("1,430,ORDINATEUR,New laptop", rules.get(1));
        assertEquals("2,500,MAISON,", rules.get(2));
    }

    @Test
    void leavesCurrentFormatAlone() throws IOException {
        String categories = "Id,GroupId,SubId,GroupName,Name,Color\n"
                + "430,4,30,Loisir,Ordinateur,#32bdbc\n";
        String transactions = "Id,Category_Id,PaymentType,Amount,BankDate,RealDate,"
                + "Title,Description,Bill_Id\n"
                + "1,430,DEBIT,-999.00,2026-10-13,2026-10-12,ORDINATEUR,,INV-1\n";
        Files.writeString(tempDir.resolve("categories.csv"), categories, StandardCharsets.UTF_8);
        Files.writeString(tempDir.resolve("transactions.csv"), transactions, StandardCharsets.UTF_8);

        assertFalse(migrator.migrate(tempDir));

        assertEquals(categories, Files.readString(
                tempDir.resolve("categories.csv"), StandardCharsets.UTF_8));
        assertEquals(transactions, Files.readString(
                tempDir.resolve("transactions.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void runsOnlyOnce() throws IOException {
        Files.writeString(tempDir.resolve("categories.csv"),
                "Id,Name,Color\n43,Ordinateur,#32bdbc\n",
                StandardCharsets.UTF_8);

        assertTrue(migrator.migrate(tempDir));
        String migrated = Files.readString(tempDir.resolve("categories.csv"), StandardCharsets.UTF_8);

        assertFalse(migrator.migrate(tempDir));
        assertEquals(migrated, Files.readString(
                tempDir.resolve("categories.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void doesNothingWhenTheFileDoesNotExist() throws IOException {
        assertFalse(migrator.migrate(tempDir));
        assertFalse(Files.exists(tempDir.resolve("categories.csv")));
    }
}
